import React from 'react';
import {ValueBadge} from './ValueBadge';
import {Tooltip,TooltipContent,TooltipTrigger} from './Tooltip';

export type BusinessClassification={tipo:string;subtipo?:string|null};

/** Renders every business vertical and subtype; compact mode shows one pair plus a count. */
export function BusinessClassificationBadges({classifications,compact=false,verticals,subtypes,displayPair}:{classifications?:readonly BusinessClassification[];compact?:boolean;verticals?:readonly string[];subtypes?:readonly string[];displayPair?:BusinessClassification}){
 const pairs=classifications?.filter(item=>item.tipo)??(compact?[displayPair?.tipo?displayPair:{tipo:(verticals??[])[0]??'',subtipo:displayPair?.subtipo}].filter(item=>item.tipo):[]);
 const description=classifications?pairs.map(item=>[item.tipo,item.subtipo].filter(Boolean).join(' · ')).join(', '):[...(verticals??[]),...(subtypes??[])].join(' · ');
 if(!pairs.length&&!(verticals?.length||subtypes?.length))return <>—</>;
 const shown=compact?pairs.slice(0,1):pairs;
 return <Tooltip><TooltipTrigger asChild><span style={{display:'inline-flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>{shown.map((item,index)=><span key={item.tipo+'|'+(item.subtipo??'')+'|'+index} style={{display:'inline-flex',gap:4,alignItems:'center'}}><ValueBadge category="vertical" value={item.tipo}/>{item.subtipo&&<ValueBadge category="subtype" value={item.subtipo}/>}</span>)}{!classifications&&!compact&&(verticals??[]).map((vertical,index)=><ValueBadge key={vertical+'|'+index} category="vertical" value={vertical}/>)}{!classifications&&!compact&&(subtypes??[]).map((subtype,index)=><ValueBadge key={subtype+'|'+index} category="subtype" value={subtype}/>)}{compact&&(verticals??[]).length>1&&<span>+{(verticals??[]).length-1}</span>}</span></TooltipTrigger><TooltipContent>{description}</TooltipContent></Tooltip>;
}
