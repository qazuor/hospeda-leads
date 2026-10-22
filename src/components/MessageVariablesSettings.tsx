import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, Copy, Variable } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import { Input } from "./Input";
import { NativeSelect } from "./NativeSelect";
import { useOperationGuard } from "../helpers/useOperationGuard";
import {crmError} from '../helpers/crmErrors';
import { postSettingsSave } from "../endpoints/settings_save_POST.schema";
import type { SettingsOutput } from "../endpoints/settings_GET.schema";
import { defaultMessageVariableSettings, resolveMessageVariables, MESSAGE_VARIABLE_CRM_SOURCES, MESSAGE_VARIABLE_SYSTEM_SOURCES, type MessageVariableDefinition, type MessageVariableAlternative } from "../helpers/messageVariables";
import styles from "./MessageVariablesSettings.module.css";

type Props = { data: SettingsOutput };
const managementTypes = [["main", "Vertical principal"], ["partner", "Partner"], ["provider", "Proveedor"], ["editor", "Editor"], ["accompaniment", "Acompañamiento"]];
const fresh = (key = "nueva_variable"): MessageVariableDefinition => ({ key, label: "", description: "", source: { kind: "text", key: "" }, alternatives: [{ id: crypto.randomUUID(), text: "", conditions: {} }], active: true });
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 38);

export function MessageVariablesSettings({ data }: Props) {
  const qc = useQueryClient();
  const [variables, setVariables] = useState<MessageVariableDefinition[]>(data.messageVariables ?? defaultMessageVariableSettings());
  const [selectedKey, setSelectedKey] = useState(variables[0]?.key ?? "");
  const selected = variables.find(variable => variable.key === selectedKey);
  const runOperation = useOperationGuard(error => toast.error(error instanceof Error ? crmError(error) : "No se pudo guardar"));
  const [saving, setSaving] = useState(false);
  const [previewVariation,setPreviewVariation]=useState(0);
  useEffect(() => { setVariables(data.messageVariables ?? defaultMessageVariableSettings()); }, [data.messageVariables]);

  const updateSelected = (change: (variable: MessageVariableDefinition) => MessageVariableDefinition) => {
    if (!selected) return;
    setVariables(current => current.map(variable => variable.key === selected.key ? change(variable) : variable));
  };
  const addVariable = () => {
    let key = "nueva_variable", i = 2;
    while (variables.some(variable => variable.key === key)) key = `nueva_variable_${i++}`;
    const next = fresh(key);
    setVariables(current => [...current, next]); setSelectedKey(next.key);
  };
  const changeKey = (value: string) => {
    if (!selected) return;
    const nextKey = slug(value);
    setVariables(current => current.map(variable => variable.key === selected.key ? { ...variable, key: nextKey } : variable));
    setSelectedKey(nextKey);
  };
  const updateAlternative = (index: number, change: (alternative: MessageVariableAlternative) => MessageVariableAlternative) => updateSelected(variable => ({ ...variable, alternatives: variable.alternatives.map((alternative, i) => i === index ? change(alternative) : alternative) }));
  const removeSelected = () => {
    if (!selected) return;
    const dependents = variables.filter(variable => variable.key !== selected.key && variable.source.kind === "variable" && variable.source.key === selected.key);
    if (dependents.length) { toast.error(`Primero cambiá la fuente de ${dependents.map(variable => `{{${variable.key}}}`).join(", ")}.`); return; }
    const usages = data.templates.filter(template => new RegExp(`{{\\s*${selected.key}\\s*}}`).test(`${template.subject ?? ""}\n${template.body}`));
    const message = usages.length ? `{{${selected.key}}} aparece en ${usages.length} modelo(s). Si la eliminás, esos modelos mostrarán la variable pendiente hasta que los edites. ¿Eliminarla igual?` : `¿Eliminar la variable {{${selected.key}}}?`;
    if (!window.confirm(message)) return;
    const isDefault = defaultMessageVariableSettings().some(variable => variable.key === selected.key);
    const nextVariables = isDefault ? variables.map(variable => variable.key === selected.key ? { ...variable, active: false } : variable) : variables.filter(variable => variable.key !== selected.key);
    setVariables(nextVariables);
    setSelectedKey(nextVariables.find(variable => variable.active)?.key ?? "");
  };
  const save = async () => runOperation("settings", async () => {
    for (const variable of variables) {
      if (variable.source.kind === "text" && !variable.alternatives.some(alternative => alternative.text.trim())) throw new Error(`Agregá al menos un texto para {{${variable.key}}}.`);
      if (variable.alternatives.some(alternative => !alternative.text.trim())) throw new Error(`Completá o eliminá las alternativas vacías de {{${variable.key}}}.`);
    }
    setSaving(true);
    try {
      await postSettingsSave({ action: "saveMessageVariables", variables });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Variables guardadas");
    } finally { setSaving(false); }
  });
  const selectedUsageCount = selected ? data.templates.filter(template => new RegExp(`{{\\s*${selected.key}\\s*}}`).test(`${template.subject ?? ""}\n${template.body}`)).length : 0;
  const isBuiltIn = selected ? defaultMessageVariableSettings().some(variable => variable.key === selected.key) : false;

  return <div className={styles.root}>
    <section className={styles.intro}>
      <div className={styles.heading}><Variable size={21}/><div><h2>Variables de texto</h2><p>Administrá los valores que se insertan en los modelos. Podés usar datos del CRM, del sistema o textos con condiciones de contexto.</p></div></div>
      <p className={styles.rule}>Las alternativas se eligen según las condiciones configuradas. Se prioriza el grupo más específico y, si hay varias redacciones equivalentes, se elige una de forma estable por negocio y día.</p>
    </section>

    <div className={styles.workspace}>
      <aside className={styles.listCard} aria-label="Variables disponibles">
        <div className={styles.listHeader}><strong>Variables</strong><Button size="sm" variant="outline" onClick={addVariable}><Plus size={15}/>Nueva</Button></div>
        <div className={styles.variableList}>{variables.filter(variable=>variable.active).map(variable => <button key={variable.key} type="button" className={selectedKey === variable.key ? styles.selected : ""} onClick={() => setSelectedKey(variable.key)}>
          <span><strong>{variable.label || "Sin nombre"}</strong><code>{`{{${variable.key}}}`}</code></span><small>{variable.source.kind === "text" ? `${variable.alternatives.length} textos` : variable.source.kind === "crm" ? "Dato del CRM" : variable.source.kind === "system" ? "Dato del sistema" : "Otra variable"}</small>
        </button>)}</div>
      </aside>

      {selected ? <section className={styles.editorCard} aria-label={`Editar variable ${selected.key}`}>
        <header className={styles.editorHeader}><div><h3>Editar variable</h3><p>El identificador se usa dentro de los modelos.</p></div><Button variant="ghost" size="icon-sm" title="Eliminar variable" aria-label="Eliminar variable" onClick={removeSelected}><Trash2 size={16}/></Button></header>
        <div className={styles.fields}>
          <label>Nombre visible<Input value={selected.label} maxLength={100} onChange={event => updateSelected(variable => ({ ...variable, label: event.target.value }))} placeholder="Ej.: Saludo"/></label>
          <label>Identificador<Input value={selected.key} maxLength={40} disabled={isBuiltIn || selectedUsageCount > 0} onChange={event => changeKey(event.target.value)} aria-describedby="variable-key-hint"/><small id="variable-key-hint">Se inserta como <code>{`{{${selected.key}}}`}</code>.{isBuiltIn ? " Es una variable existente y se conserva para no romper modelos." : selectedUsageCount ? ` Está en ${selectedUsageCount} modelo(s); no se puede cambiar mientras se use.` : " Usá minúsculas, números y guion bajo."}</small></label>
          <label className={styles.full}>Descripción para el equipo<Input value={selected.description} maxLength={500} onChange={event => updateSelected(variable => ({ ...variable, description: event.target.value }))} placeholder="Para qué sirve y cuándo usarla"/></label>
          <label>Fuente del valor<NativeSelect value={selected.source.kind} onChange={event => updateSelected(variable => {
            const kind = event.target.value as MessageVariableDefinition["source"]["kind"];
            const key = kind === "crm" ? MESSAGE_VARIABLE_CRM_SOURCES[0][0] : kind === "system" ? MESSAGE_VARIABLE_SYSTEM_SOURCES[0][0] : "";
            return { ...variable, source: { kind, key } };
          })}>
            <option value="text">Texto alternativo</option><option value="crm">Dato del CRM</option><option value="system">Dato del sistema</option><option value="variable">Otra variable</option>
          </NativeSelect></label>
          {selected.source.kind === "crm" && <label>Campo<NativeSelect value={selected.source.key} onChange={event => updateSelected(variable => ({ ...variable, source: { ...variable.source, key: event.target.value } }))}>{MESSAGE_VARIABLE_CRM_SOURCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label>}
          {selected.source.kind === "system" && <label>Dato<NativeSelect value={selected.source.key} onChange={event => updateSelected(variable => ({ ...variable, source: { ...variable.source, key: event.target.value } }))}>{MESSAGE_VARIABLE_SYSTEM_SOURCES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label>}
          {selected.source.kind === "variable" && <label>Variable de origen<NativeSelect value={selected.source.key} onChange={event => updateSelected(variable => ({ ...variable, source: { ...variable.source, key: event.target.value } }))}><option value="">Elegir variable</option>{variables.filter(variable => variable.key !== selected.key).map(variable => <option key={variable.key} value={variable.key}>{variable.label} · {`{{${variable.key}}}`}</option>)}</NativeSelect></label>}
        </div>

        <section className={styles.alternatives}>
          <header><div><h4>{selected.source.kind === "text" ? "Textos alternativos" : "Textos según contexto (opcional)"}</h4><p>{selected.source.kind === "text" ? "Agregá opciones generales o condicionadas para adaptar la frase." : "Si una condición coincide, este texto reemplaza el dato de origen."}</p></div><Button size="sm" variant="outline" onClick={() => updateSelected(variable => ({ ...variable, alternatives: [...variable.alternatives, { id: crypto.randomUUID(), text: "", conditions: {} }] }))}><Plus size={14}/>Agregar texto</Button></header>
          <div aria-label="Vista previa de la variable"><strong>Vista previa</strong><p>{resolveMessageVariables({__seed:`admin-preview:${previewVariation}`},variables)[selected.key]||'Agregá una alternativa general para ver el resultado.'}</p><Button size="sm" variant="outline" onClick={()=>setPreviewVariation(value=>value+1)}>Otra redacción</Button></div>
          {selected.alternatives.map((alternative, index) => {const group=selected.alternatives.filter(item=>JSON.stringify(item.conditions)===JSON.stringify(alternative.conditions));const groupIndex=group.findIndex(item=>item.id===alternative.id)+1;return <article className={styles.alternative} key={alternative.id}>
            <div className={styles.alternativeTop}><strong>{group.length>1?`Variante ${groupIndex} de un grupo`:`Texto ${index + 1}`}</strong><Button variant="ghost" size="icon-sm" title="Eliminar texto" aria-label={`Eliminar texto ${index + 1}`} onClick={() => updateSelected(variable => ({ ...variable, alternatives: variable.alternatives.filter((_, i) => i !== index) }))}><Trash2 size={14}/></Button></div>
            <textarea value={alternative.text} maxLength={4000} rows={3} onChange={event => updateAlternative(index, current => ({ ...current, text: event.target.value }))} placeholder="Escribí el texto que aparecerá en el mensaje"/>
            <div className={styles.conditions}>
              <label>Vertical<NativeSelect value={alternative.conditions.vertical ?? ""} onChange={event => updateAlternative(index, current => ({ ...current, conditions: { ...current.conditions, vertical: event.target.value || null } }))}><option value="">Cualquiera</option>{data.types.map(type => <option key={type} value={type}>{type}</option>)}</NativeSelect></label>
              <label>Tipo de negocio<NativeSelect value={alternative.conditions.businessType ?? ""} onChange={event => updateAlternative(index, current => ({ ...current, conditions: { ...current.conditions, businessType: event.target.value || null } }))}><option value="">Cualquiera</option>{data.subtypes.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}</NativeSelect></label>
              <label>Tipo de gestión<NativeSelect value={alternative.conditions.managementType ?? ""} onChange={event => updateAlternative(index, current => ({ ...current, conditions: { ...current.conditions, managementType: event.target.value || null } }))}><option value="">Cualquiera</option>{managementTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect></label>
              <label>Hora local<NativeSelect value={alternative.conditions.dayPeriod ?? ""} onChange={event => updateAlternative(index, current => ({ ...current, conditions: { ...current.conditions, dayPeriod: (event.target.value || null) as MessageVariableAlternative["conditions"]["dayPeriod"] } }))}><option value="">Cualquier hora</option><option value="morning">Mañana</option><option value="afternoon">Tarde</option><option value="evening">Noche</option></NativeSelect></label>
              <label>Canal<NativeSelect value={alternative.conditions.channel ?? ""} onChange={event => updateAlternative(index, current => ({ ...current, conditions: { ...current.conditions, channel: (event.target.value || null) as MessageVariableAlternative["conditions"]["channel"] } }))}><option value="">Cualquier canal</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="social">Red social</option><option value="other">Otro</option></NativeSelect></label>
              <label>Nombre de contacto<NativeSelect value={alternative.conditions.contactName ?? ""} onChange={event => updateAlternative(index, current => ({ ...current, conditions: { ...current.conditions, contactName: (event.target.value || null) as MessageVariableAlternative["conditions"]["contactName"] } }))}><option value="">Con o sin nombre</option><option value="present">Hay nombre</option><option value="missing">No hay nombre</option></NativeSelect></label>
              <label>Ciudades<Input aria-label="Ciudades (separadas por coma)" value={(alternative.conditions.cities??[]).join(', ')} onChange={event=>updateAlternative(index,current=>({...current,conditions:{...current.conditions,cities:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)}}))}/></label>
              <label>Perfil comercial<NativeSelect value={alternative.conditions.commercialProfile??''} onChange={event=>updateAlternative(index,current=>({...current,conditions:{...current.conditions,commercialProfile:(event.target.value||null) as MessageVariableAlternative['conditions']['commercialProfile']}}))}><option value="">Cualquiera</option><option>Independiente</option><option>Consolidado</option><option>Referente</option><option value="none">Sin perfil</option></NativeSelect></label>
              <label>Propósito<NativeSelect value={alternative.conditions.purpose??''} onChange={event=>updateAlternative(index,current=>({...current,conditions:{...current.conditions,purpose:(event.target.value||null) as MessageVariableAlternative['conditions']['purpose']}}))}><option value="">Cualquiera</option>{[['verification','Verificar'],['first_contact','Primer contacto'],['resume','Retomar'],['relationship','Relación'],['care','Acompañamiento'],['operations','Operaciones'],['other','Otro']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</NativeSelect></label>
              <label>Días de semana (0–6)<Input aria-label="Días de semana, números separados por coma" value={(alternative.conditions.weekdays??[]).join(', ')} onChange={event=>updateAlternative(index,current=>({...current,conditions:{...current.conditions,weekdays:event.target.value?event.target.value.split(',').map(Number).filter(Number.isInteger):[]}}))}/></label>
              <label>Meses (1–12)<Input aria-label="Meses, números separados por coma" value={(alternative.conditions.months??[]).join(', ')} onChange={event=>updateAlternative(index,current=>({...current,conditions:{...current.conditions,months:event.target.value?event.target.value.split(',').map(Number).filter(Number.isInteger):[]}}))}/></label>
              <label>Es cliente<NativeSelect value={alternative.conditions.isClient==null?'':String(alternative.conditions.isClient)} onChange={event=>updateAlternative(index,current=>({...current,conditions:{...current.conditions,isClient:event.target.value===''?null:event.target.value==='true'}}))}><option value="">Cualquiera</option><option value="true">Sí</option><option value="false">No</option></NativeSelect></label>
            </div>
          </article>})}
          {!selected.alternatives.length && <p className={styles.empty}>No hay textos alternativos. Si el dato de origen está vacío, la variable quedará pendiente.</p>}
        </section>
        <footer className={styles.footer}><Button variant="outline" onClick={() => setVariables(data.messageVariables ?? defaultMessageVariableSettings())} disabled={saving} disabledReason="Esperá a que termine el guardado."><Copy size={15}/>Descartar cambios</Button><Button onClick={save} disabled={saving} disabledReason="Esperá a que termine el guardado."><Save size={15}/>{saving ? "Guardando…" : "Guardar variables"}</Button></footer>
      </section> : <section className={styles.emptyEditor}><Variable size={25}/><strong>Elegí una variable para editar</strong><p>O creá una nueva para usarla en los modelos de mensajes.</p></section>}
    </div>
  </div>;
}
