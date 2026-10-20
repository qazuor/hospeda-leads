export type MessageVariableCondition = {
  vertical?: string | null;
  businessType?: string | null;
  managementType?: string | null;
  dayPeriod?: "morning" | "afternoon" | "evening" | null;
  channel?: "email" | "whatsapp" | "social" | "other" | null;
  contactName?: "present" | "missing" | null;
};

export type MessageVariableAlternative = {
  id: string;
  text: string;
  conditions: MessageVariableCondition;
};

export type MessageVariableDefinition = {
  key: string;
  label: string;
  description: string;
  source: { kind: "text" | "crm" | "system" | "variable"; key: string };
  alternatives: MessageVariableAlternative[];
  active: boolean;
};

export const DEFAULT_MESSAGE_VARIABLES: MessageVariableDefinition[] = [
  { key: "contact", label: "Persona de contacto", description: "Nombre de la persona elegida para el contacto.", source: { kind: "crm", key: "contact" }, alternatives: [], active: true },
  { key: "name", label: "Nombre del negocio", description: "Nombre del negocio en el CRM.", source: { kind: "crm", key: "name" }, alternatives: [], active: true },
  { key: "type", label: "Vertical o tipo", description: "Vertical o tipo de negocio registrado.", source: { kind: "crm", key: "type" }, alternatives: [], active: true },
  { key: "sender", label: "Responsable asignado", description: "Nombre de quien tiene asignado el negocio.", source: { kind: "crm", key: "sender" }, alternatives: [], active: true },
  { key: "hospeda_url", label: "Ficha pública", description: "Enlace a la ficha pública, si existe.", source: { kind: "crm", key: "hospeda_url" }, alternatives: [], active: true },
  { key: "saludo", label: "Saludo", description: "Saluda según la hora local de Argentina.", source: { kind: "text", key: "" }, alternatives: [
    { id: "saludo-manana", text: "Buen día", conditions: { dayPeriod: "morning" } },
    { id: "saludo-tarde", text: "Buenas tardes", conditions: { dayPeriod: "afternoon" } },
    { id: "saludo-noche", text: "Buenas noches", conditions: { dayPeriod: "evening" } },
  ], active: true },
  { key: "gracias", label: "Agradecimiento", description: "Agradecimiento breve que se adapta al canal.", source: { kind: "text", key: "" }, alternatives: [
    { id: "gracias-general", text: "Gracias por tu tiempo.", conditions: {} },
    { id: "gracias-whatsapp", text: "¡Gracias por leerme!", conditions: { channel: "whatsapp" } },
    { id: "gracias-email", text: "Muchas gracias por tu atención.", conditions: { channel: "email" } },
  ], active: true },
  { key: "despedida", label: "Despedida", description: "Cierre cordial según el momento del día.", source: { kind: "text", key: "" }, alternatives: [
    { id: "despedida-general", text: "Saludos.", conditions: {} },
    { id: "despedida-manana", text: "¡Que tengas un buen día!", conditions: { dayPeriod: "morning" } },
    { id: "despedida-tarde", text: "¡Que tengas una buena tarde!", conditions: { dayPeriod: "afternoon" } },
    { id: "despedida-noche", text: "¡Que tengas una linda noche!", conditions: { dayPeriod: "evening" } },
  ], active: true },
  { key: "presentacion", label: "Presentación", description: "Presentación breve de quien escribe y de Hospeda.", source: { kind: "text", key: "" }, alternatives: [
    { id: "presentacion-base", text: "Soy {{sender}}, de Hospeda.", conditions: {} },
  ], active: true },
  { key: "pregunta_cierre", label: "Pregunta de cierre", description: "Invita a responder con una pregunta sencilla, ajustada al canal.", source: { kind: "text", key: "" }, alternatives: [
    { id: "pregunta-general", text: "¿Te gustaría que te cuente un poco más?", conditions: {} },
    { id: "pregunta-whatsapp", text: "¿Querés que te cuente un poco más por acá?", conditions: { channel: "whatsapp" } },
    { id: "pregunta-email", text: "¿Te interesaría recibir más información?", conditions: { channel: "email" } },
  ], active: true },
  { key: "firma", label: "Firma", description: "Nombre del responsable y equipo.", source: { kind: "text", key: "" }, alternatives: [
    { id: "firma-base", text: "{{sender}}\nEquipo Hospeda", conditions: {} },
  ], active: true },
];

export const MESSAGE_VARIABLE_CRM_SOURCES = [
  ["name", "Nombre del negocio"], ["city", "Localidad"], ["type", "Vertical"],
  ["subtype", "Tipo de negocio"], ["contact", "Nombre del contacto"], ["email", "Email elegido"],
  ["phone", "Teléfono elegido"], ["website", "Sitio web"], ["sender", "Responsable asignado"],
  ["sender_short", "Nombre corto del responsable"], ["hospeda_url", "Enlace a la ficha pública"],
  ["business_status", "Estado del negocio"], ["is_client", "Marca Es cliente"],
] as const;

export const MESSAGE_VARIABLE_SYSTEM_SOURCES = [
  ["greeting", "Saludo según la hora"], ["hour", "Hora local"], ["weekday", "Día de la semana"],
  ["month", "Mes actual"], ["date", "Fecha local"],
] as const;

export function defaultMessageVariableSettings(): MessageVariableDefinition[] {
  return DEFAULT_MESSAGE_VARIABLES.map(variable => ({
    ...variable,
    source: { ...variable.source },
    alternatives: variable.alternatives.map(alternative => ({ ...alternative, conditions: { ...alternative.conditions } })),
  }));
}

export function withDefaultMessageVariables(stored: unknown): MessageVariableDefinition[] {
  const variables = stored == null ? [] : validateMessageVariables(stored);
  const present = new Set(variables.map(variable => variable.key));
  for (const variable of defaultMessageVariableSettings()) if (!present.has(variable.key)) variables.push(variable);
  return variables;
}

export function validateMessageVariables(value: unknown): MessageVariableDefinition[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("La configuración de variables no es válida.");
  const keys = new Set<string>();
  let totalCharacters = 0;
  return value.map((raw: any) => {
    const key = String(raw?.key ?? "");
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key) || keys.has(key)) throw new Error("Cada variable necesita un nombre único en minúsculas, sin espacios.");
    keys.add(key);
    const label = String(raw?.label ?? "").trim();
    if (!label || label.length > 100) throw new Error(`Completá un nombre breve para {{${key}}}.`);
    totalCharacters += label.length + String(raw?.description ?? "").length;
    const sourceKind = raw?.source?.kind;
    const sourceKey = String(raw?.source?.key ?? "");
    if (!["text", "crm", "system", "variable"].includes(sourceKind)) throw new Error(`La fuente de {{${key}}} no es válida.`);
    if (sourceKind === "crm" && !MESSAGE_VARIABLE_CRM_SOURCES.some(([field]) => field === sourceKey)) throw new Error(`El campo CRM de {{${key}}} no está permitido.`);
    if (sourceKind === "system" && !MESSAGE_VARIABLE_SYSTEM_SOURCES.some(([field]) => field === sourceKey)) throw new Error(`El dato del sistema de {{${key}}} no está permitido.`);
    if (sourceKind === "variable" && (!/^[a-z][a-z0-9_]{1,39}$/.test(sourceKey) || sourceKey === key)) throw new Error(`La referencia anidada de {{${key}}} no es válida.`);
    if (sourceKind === "text" && sourceKey !== "") throw new Error(`La fuente de texto de {{${key}}} debe quedar vacía.`);
    if (!Array.isArray(raw?.alternatives) || raw.alternatives.length > 100) throw new Error(`Las alternativas de {{${key}}} no son válidas.`);
    const alternativeScopes = new Set<string>();
    const alternatives = raw.alternatives.map((item: any, index: number) => {
      const text = String(item?.text ?? "");
      if (!text.trim() || text.length > 4000) throw new Error(`La alternativa ${index + 1} de {{${key}}} necesita texto (máximo 4000 caracteres).`);
      totalCharacters += text.length;
      if (totalCharacters > 100_000) throw new Error("La configuración completa no puede superar los 100.000 caracteres.");
      const c = item?.conditions ?? {};
      const dayPeriod = c.dayPeriod || null;
      if (dayPeriod && !["morning", "afternoon", "evening"].includes(dayPeriod)) throw new Error(`La condición horaria de {{${key}}} no es válida.`);
      const channel = c.channel || null;
      if (channel && !["email", "whatsapp", "social", "other"].includes(channel)) throw new Error(`La condición de canal de {{${key}}} no es válida.`);
      const contactName = c.contactName || null;
      if (contactName && !["present", "missing"].includes(contactName)) throw new Error(`La condición de contacto de {{${key}}} no es válida.`);
      const conditions = {
        vertical: c.vertical ? String(c.vertical).slice(0, 100) : null,
        businessType: c.businessType ? String(c.businessType).slice(0, 100) : null,
        managementType: c.managementType ? String(c.managementType).slice(0, 40) : null,
        dayPeriod,
        channel,
        contactName,
      };
      const scope = JSON.stringify(conditions);
      if (alternativeScopes.has(scope)) throw new Error(`{{${key}}} tiene dos textos para las mismas condiciones; cada combinación debe tener una sola variante.`);
      alternativeScopes.add(scope);
      return { id: String(item?.id || `${key}-${index + 1}`).slice(0, 80), text, conditions };
    });
    return { key, label, description: String(raw?.description ?? "").slice(0, 500), source: { kind: sourceKind, key: sourceKind === "text" ? "" : sourceKey }, alternatives, active: raw?.active !== false } as MessageVariableDefinition;
  });
}

export function systemTemplateContext(now = new Date()) {
  const parts = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? 0);
  const dayPeriod = hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening";
  const local = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  return {
    __dayPeriod: dayPeriod,
    __system: {
      greeting: dayPeriod === "morning" ? "Buen día" : dayPeriod === "afternoon" ? "Buenas tardes" : "Buenas noches",
      hour: `${String(hour).padStart(2, "0")}:${parts.find(part => part.type === "minute")?.value ?? "00"}`,
      weekday: new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long" }).format(now),
      month: new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", month: "long" }).format(now),
      date: local.format(now),
    },
  };
}

export function resolveMessageVariables(context: Record<string, unknown>, definitions: MessageVariableDefinition[] = defaultMessageVariableSettings(), now = new Date()) {
  const values: Record<string, string> = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, value == null ? "" : String(value).trim()]));
  const system = systemTemplateContext(now);
  const fullContext = { ...context, ...system } as Record<string, any>;
  const active = definitions.filter(item => item.active);
  const byKey = new Map(active.map(item => [item.key, item]));
  const resolved = new Set<string>();
  const resolve = (key: string, depth = 0): string => {
    if (!byKey.has(key)) return values[key] ?? "";
    if (resolved.has(key) || depth > 10) return "";
    const variable = byKey.get(key);
    if (!variable) return "";
    resolved.add(key);
    const matches = variable.alternatives.flatMap((alternative, index) => {
      const c = alternative.conditions;
      if (c.vertical && c.vertical !== String(fullContext.type ?? "")) return [];
      if (c.businessType && c.businessType !== String(fullContext.subtype ?? "")) return [];
      if (c.managementType && c.managementType !== String(fullContext.managementType ?? "")) return [];
      if (c.dayPeriod && c.dayPeriod !== system.__dayPeriod) return [];
      if (c.channel && c.channel !== String(fullContext.channel ?? "")) return [];
      if (c.contactName === "present" && !String(fullContext.contact ?? "").trim()) return [];
      if (c.contactName === "missing" && String(fullContext.contact ?? "").trim()) return [];
      const specificity = Number(!!c.vertical) + Number(!!c.businessType) + Number(!!c.managementType) + Number(!!c.dayPeriod) + Number(!!c.channel) + Number(!!c.contactName);
      return [{ alternative, specificity, index }];
    }).sort((a, b) => b.specificity - a.specificity || a.index - b.index);
    let output = "";
    if (matches.length) output = matches[0].alternative.text.replace(/{{([a-zA-Z0-9_]+)}}/g, (_, nestedKey) => resolve(nestedKey, depth + 1));
    else if (variable.source.kind === "crm") output = values[variable.source.key] ?? "";
    else if (variable.source.kind === "system") output = String((system.__system as any)[variable.source.key] ?? "");
    else if (variable.source.kind === "variable") output = resolve(variable.source.key, depth + 1);
    resolved.delete(key);
    return output;
  };
  for (const variable of active) values[variable.key] = resolve(variable.key);
  return values;
}
