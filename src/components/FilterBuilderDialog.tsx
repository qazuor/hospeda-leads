import React, { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Input } from "./Input";
import type { AdvancedFilterGroup, AdvancedFilterRule } from "../endpoints/leads_GET.schema";
import styles from "./FilterBuilderDialog.module.css";

export type FilterFieldKind="category"|"text"|"date"|"boolean"|"number"|"notes";
export type FilterFieldDefinition={
  key:AdvancedFilterRule["field"];
  label:string;
  kind:FilterFieldKind;
  options?:{value:string;label:string}[];
};

const operatorLabels:Record<AdvancedFilterRule["operator"],string>={
  eq:"es",
  neq:"no es",
  contains:"contiene",
  not_contains:"no contiene",
  empty:"sin valor",
  not_empty:"con valor",
  gte:"mayor o igual",
  lte:"menor o igual",
  between:"entre",
  before:"antes de",
  after:"después de",
  on:"en la fecha",
  is_true:"sí",
  is_false:"no"
};

const operatorsFor=(kind:FilterFieldKind):AdvancedFilterRule["operator"][]=>{
  if(kind==="category")return ["eq","neq","empty","not_empty"];
  if(kind==="date")return ["on","before","after","between","empty","not_empty"];
  if(kind==="boolean")return ["is_true","is_false"];
  if(kind==="number")return ["eq","gte","lte","between"];
  return ["contains","not_contains","eq","neq","empty","not_empty"];
};

const defaultOperator=(kind:FilterFieldKind):AdvancedFilterRule["operator"]=>{
  if(kind==="category"||kind==="number")return "eq";
  if(kind==="date")return "on";
  if(kind==="boolean")return "is_true";
  return "contains";
};

const needsValue=(operator:AdvancedFilterRule["operator"])=>!["empty","not_empty","is_true","is_false"].includes(operator);

const cloneGroups=(groups:AdvancedFilterGroup[])=>groups.map(group=>({rules:group.rules.map(rule=>({...rule}))}));

const makeRule=(field:FilterFieldDefinition):AdvancedFilterRule=>({
  field:field.key,
  operator:defaultOperator(field.kind),
  value:"",
  value2:""
});

export const FilterBuilderDialog=({
  open,onOpenChange,fields,value,search="",title="Filtrar gestiones",onApply
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  fields:FilterFieldDefinition[];
  value:AdvancedFilterGroup[];
  search?:string;
  title?:string;
  onApply:(groups:AdvancedFilterGroup[],search:string)=>void;
})=>{
  const [draft,setDraft]=useState<AdvancedFilterGroup[]>([]);
  const [draftSearch,setDraftSearch]=useState("");
  const fieldMap=useMemo(()=>new Map(fields.map(field=>[field.key,field])),[fields]);
  useEffect(()=>{
    if(open){setDraft(cloneGroups(value));setDraftSearch(search);}
  },[open,value,search]);

  const addGroup=()=>{
    const first=fields[0];
    if(!first)return;
    setDraft(prev=>[...prev,{rules:[makeRule(first)]}]);
  };
  const addOr=(groupIndex:number)=>{
    const first=fields[0];
    if(!first)return;
    setDraft(prev=>prev.map((group,index)=>index===groupIndex?{...group,rules:[...group.rules,makeRule(first)]}:group));
  };
  const updateRule=(groupIndex:number,ruleIndex:number,next:AdvancedFilterRule)=>{
    setDraft(prev=>prev.map((group,index)=>index===groupIndex
      ? {...group,rules:group.rules.map((rule,i)=>i===ruleIndex?next:rule)}
      : group));
  };
  const removeRule=(groupIndex:number,ruleIndex:number)=>{
    setDraft(prev=>prev.flatMap((group,index)=>{
      if(index!==groupIndex)return [group];
      const rules=group.rules.filter((_,i)=>i!==ruleIndex);
      return rules.length?[{...group,rules}]:[];
    }));
  };
  const changeField=(groupIndex:number,ruleIndex:number,fieldKey:AdvancedFilterRule["field"])=>{
    const field=fieldMap.get(fieldKey);
    if(!field)return;
    updateRule(groupIndex,ruleIndex,makeRule(field));
  };
  const changeOperator=(groupIndex:number,ruleIndex:number,operator:AdvancedFilterRule["operator"])=>{
    const rule=draft[groupIndex]?.rules[ruleIndex];
    if(!rule)return;
    updateRule(groupIndex,ruleIndex,{...rule,operator,value:needsValue(operator)?rule.value:"",value2:operator==="between"?rule.value2:""});
  };
  const validDraft=draft.map(group=>({
    rules:group.rules.filter(rule=>{
      if(!needsValue(rule.operator))return true;
      if(rule.operator==="between")return !!rule.value?.trim()&&!!rule.value2?.trim();
      return !!rule.value?.trim();
    })
  })).filter(group=>group.rules.length);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={styles.dialog}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Los bloques se combinan con AND. Dentro de cada bloque podés agregar alternativas con OR.</DialogDescription>
      </DialogHeader>

      <div className={styles.builder}>
        <section className={styles.group}>
          <div className={styles.groupHeader}><div><strong>Texto libre</strong><span>Se combina con los demás filtros mediante AND.</span></div><Button variant="ghost" size="sm" onClick={()=>setDraftSearch("")} disabled={!draftSearch.trim()}>Quitar búsqueda</Button></div>
          <label className={styles.searchField}><span>Texto libre de búsqueda</span><Input value={draftSearch} onChange={e=>setDraftSearch(e.target.value)} placeholder="Buscar negocios, gestiones y notas…"/></label>
        </section>
        {draft.length===0&&!draftSearch.trim()&&<div className={styles.empty}>
          <Filter size={24}/>
          <strong>Sin filtros</strong>
          <span>Agregá una condición para empezar.</span>
        </div>}

        {draft.map((group,groupIndex)=><React.Fragment key={groupIndex}>
          {(groupIndex>0||!!draftSearch.trim())&&<div className={styles.andConnector}><span>AND</span></div>}
          <section className={styles.group}>
            <div className={styles.groupHeader}>
              <div><strong>Filtro {groupIndex+1}</strong><span>{group.rules.length>1?"Cualquiera de estas condiciones (OR)":"Esta condición debe cumplirse"}</span></div>
              <Button variant="ghost" size="sm" onClick={()=>setDraft(prev=>prev.filter((_,i)=>i!==groupIndex))}><Trash2 size={14}/>Quitar bloque</Button>
            </div>
            <div className={styles.rules}>
              {group.rules.map((rule,ruleIndex)=>{
                const field=fieldMap.get(rule.field)??fields[0];
                if(!field)return null;
                const operators=operatorsFor(field.kind);
                return <React.Fragment key={ruleIndex}>
                  {ruleIndex>0&&<div className={styles.orConnector}><span>OR</span></div>}
                  <div className={styles.rule}>
                    <select value={rule.field} onChange={e=>changeField(groupIndex,ruleIndex,e.target.value as AdvancedFilterRule["field"])}>
                      {fields.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                    <select value={rule.operator} onChange={e=>changeOperator(groupIndex,ruleIndex,e.target.value as AdvancedFilterRule["operator"])}>
                      {operators.map(operator=><option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
                    </select>
                    {needsValue(rule.operator)&&field.kind==="category"&&<select value={rule.value??""} onChange={e=>updateRule(groupIndex,ruleIndex,{...rule,value:e.target.value})}>
                      <option value="">Elegir valor…</option>
                      {field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>}
                    {needsValue(rule.operator)&&field.kind==="date"&&<Input type="date" value={rule.value??""} onChange={e=>updateRule(groupIndex,ruleIndex,{...rule,value:e.target.value})}/>}
                    {needsValue(rule.operator)&&field.kind==="number"&&<Input inputMode="numeric" value={rule.value??""} onChange={e=>updateRule(groupIndex,ruleIndex,{...rule,value:e.target.value})} placeholder="Valor"/>}
                    {needsValue(rule.operator)&&["text","notes"].includes(field.kind)&&<Input value={rule.value??""} onChange={e=>updateRule(groupIndex,ruleIndex,{...rule,value:e.target.value})} placeholder="Valor…"/>}
                    {rule.operator==="between"&&field.kind==="date"&&<Input type="date" value={rule.value2??""} onChange={e=>updateRule(groupIndex,ruleIndex,{...rule,value2:e.target.value})}/>}
                    {rule.operator==="between"&&field.kind==="number"&&<Input inputMode="numeric" value={rule.value2??""} onChange={e=>updateRule(groupIndex,ruleIndex,{...rule,value2:e.target.value})} placeholder="Hasta"/>}
                    <Button variant="ghost" size="icon-sm" onClick={()=>removeRule(groupIndex,ruleIndex)} title="Quitar condición"><Trash2 size={14}/></Button>
                  </div>
                </React.Fragment>;
              })}
            </div>
            <Button variant="outline" size="sm" onClick={()=>addOr(groupIndex)} className={styles.addOr}><Plus size={14}/>Agregar OR</Button>
          </section>
        </React.Fragment>)}
        <Button variant="outline" onClick={addGroup} className={styles.addAnd}><Plus size={15}/>Agregar filtro AND</Button>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={()=>{setDraft([]);setDraftSearch("")}} disabled={!draft.length&&!draftSearch.trim()}>Limpiar</Button>
        <div className={styles.grow}/>
        <Button variant="outline" onClick={()=>onOpenChange(false)}>Cancelar</Button>
        <Button onClick={()=>{onApply(validDraft,draftSearch.trim());onOpenChange(false)}}>Aplicar filtros</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};

export const FilterLegend=({
  groups,fields,search="",onEdit,onClear
}:{
  groups:AdvancedFilterGroup[];
  search?:string;
  fields:FilterFieldDefinition[];
  onEdit:()=>void;
  onClear:()=>void;
})=>{
  if(!groups.length&&!search.trim())return null;
  const map=new Map(fields.map(field=>[field.key,field]));
  const describe=(rule:AdvancedFilterRule)=>{
    const field=map.get(rule.field);
    const option=field?.options?.find(item=>item.value===rule.value);
    const value=option?.label??rule.value??"";
    if(["empty","not_empty","is_true","is_false"].includes(rule.operator))return `${field?.label??rule.field} ${operatorLabels[rule.operator]}`;
    if(rule.operator==="between")return `${field?.label??rule.field} ${operatorLabels[rule.operator]} ${value} y ${rule.value2??""}`;
    return `${field?.label??rule.field} ${operatorLabels[rule.operator]} ${value}`;
  };
  return <div className={styles.legend}>
    <div className={styles.legendExpression}>
      {!!search.trim()&&<div className={styles.legendGroup}><span className={styles.legendRule}>Texto libre contiene «{search.trim()}»</span></div>}
      {groups.map((group,groupIndex)=><React.Fragment key={groupIndex}>
        {(groupIndex>0||!!search.trim())&&<span className={styles.legendAnd}>AND</span>}
        <div className={styles.legendGroup}>
          {group.rules.map((rule,ruleIndex)=><React.Fragment key={ruleIndex}>
            {ruleIndex>0&&<span className={styles.legendOr}>OR</span>}
            <span className={styles.legendRule}>{describe(rule)}</span>
          </React.Fragment>)}
        </div>
      </React.Fragment>)}
    </div>
    <div className={styles.legendActions}>
      <Button variant="ghost" size="sm" onClick={onEdit}>Editar</Button>
      <Button variant="ghost" size="sm" onClick={onClear}>Limpiar</Button>
    </div>
  </div>;
};