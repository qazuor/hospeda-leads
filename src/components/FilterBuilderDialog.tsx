import React, { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Input } from "./Input";
import {Checkbox} from "./Checkbox";
import type { AdvancedFilterGroup, AdvancedFilterRule } from "../endpoints/leads_GET.schema";
import styles from "./FilterBuilderDialog.module.css";

import {makeRule,needsValue,type FilterFieldDefinition} from '../helpers/filterRules';
import {FilterRuleFields} from './FilterRuleFields';
export type {FilterFieldDefinition,FilterFieldKind} from '../helpers/filterRules';
export {FilterLegend} from './FilterLegend';
const cloneGroups=(groups:AdvancedFilterGroup[])=>groups.map(group=>({rules:group.rules.map(rule=>({...rule}))}));

export const FilterBuilderDialog=({
  open,onOpenChange,fields,value,search="",title="Filtrar gestiones",onApply,onApplyAndSave,additionalFilters=[]
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  fields:FilterFieldDefinition[];
  value:AdvancedFilterGroup[];
  search?:string;
  title?:string;
  additionalFilters?:string[];
  onApply:(groups:AdvancedFilterGroup[],search:string,clearAdditional?:boolean)=>void;
  onApplyAndSave?:(groups:AdvancedFilterGroup[],search:string,clearAdditional?:boolean)=>void;
})=>{
  const [draft,setDraft]=useState<AdvancedFilterGroup[]>([]);
  const [draftSearch,setDraftSearch]=useState("");
  const [clearAdditional,setClearAdditional]=useState(false);
  const fieldMap=useMemo(()=>new Map(fields.map(field=>[field.key,field])),[fields]);
  useEffect(()=>{
    if(open){setDraft(cloneGroups(value));setDraftSearch(search);setClearAdditional(false);}
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
        {additionalFilters.length>0&&<section className={styles.group}><strong>Otros filtros de esta vista</strong><ul>{additionalFilters.map((label,index)=><li key={index}>{label}</li>)}</ul><label className={styles.additionalChoice}><Checkbox checked={clearAdditional} onChange={event=>setClearAdditional(event.target.checked)}/>Quitar estos filtros al aplicar</label></section>}

        <section className={styles.group}>
          <div className={styles.groupHeader}><div><strong>Texto libre</strong><span>Se combina con los demás filtros mediante AND.</span></div><Button variant="ghost" size="sm" onClick={()=>setDraftSearch("")} disabled={!draftSearch.trim()}><Trash2 size={14} aria-hidden="true"/>Quitar búsqueda</Button></div>
          <label className={styles.searchField}><span>Texto libre de búsqueda</span><Input value={draftSearch} onChange={e=>setDraftSearch(e.target.value)} placeholder="Buscar negocios, gestiones y notas…"/></label>
        </section>
        {draft.length===0&&!draftSearch.trim()&&(!additionalFilters.length||clearAdditional)&&<div className={styles.empty}>
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
                return <React.Fragment key={ruleIndex}>
                  {ruleIndex>0&&<div className={styles.orConnector}><span>OR</span></div>}
                  <div className={styles.rule}>
                    <FilterRuleFields rule={rule} fields={fields} onChange={next=>updateRule(groupIndex,ruleIndex,next)}/>
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
        <Button variant="ghost" onClick={()=>{setDraft([]);setDraftSearch("");setClearAdditional(true)}} disabled={!draft.length&&!draftSearch.trim()&&!additionalFilters.length}>Limpiar</Button>
        <div className={styles.grow}/>
        <Button variant="outline" onClick={()=>onOpenChange(false)}>Cancelar</Button>
        {onApplyAndSave&&<Button variant="outline" onClick={()=>{onApplyAndSave(validDraft,draftSearch.trim(),clearAdditional);onOpenChange(false);}}>Aplicar y guardar como vista</Button>}
        <Button onClick={()=>{onApply(validDraft,draftSearch.trim(),clearAdditional);onOpenChange(false)}}>Aplicar filtros</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
};
