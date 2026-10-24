import React from "react";
import { Badge } from "@mantine/core";
import {businessStatusLabels} from "../helpers/businessStatus";
import {managementStageCatalog,managementTypes} from "../helpers/businessManagement";
import {verticalTone} from "../helpers/verticalColors";
import {toneHue,toneOfValue,toneToken,type ToneName} from "../helpers/tones";
import styles from "./ValueBadge.module.css";

type Category="vertical"|"subtype"|"status"|"review"|"priority"|"city"|"person"|"contact"|"profile"|"generic";

export type BadgeTone=ToneName;
const legacy=new Map<string,readonly [number,number]>(Object.entries({"status:Cargado":[215,12],"status:Filtrado":[210,76],"status:1er contacto":[190,74],"status:En tratativas":[38,90],"status:Suscripto":[143,61],"status:Promocionado a Leandro":[268,63],"status:Rechazado":[0,68],"status:No interesado":[355,43],"status:Re contactar mas adelante":[238,55],"priority:alta":[0,68],"priority:media":[38,90],"priority:baja":[143,52],"profile:Independiente":[162,57],"profile:Consolidado":[205,69],"profile:Referente":[274,61]} as Record<string,readonly [number,number]>));
const hashTone=(value:string):readonly [number,number]=>{let hash=0;for(let i=0;i<value.length;i++)hash=(hash*31+value.charCodeAt(i))|0;return [Math.abs(hash)%360,65];};
const isPlaceholder=(value:string)=>['sin responsable','—','-',''].includes(value.trim().toLocaleLowerCase('es-AR'));
export const badgeTone=(category:Category,value:string):BadgeTone=>toneOfValue(category,value);

export const valueBadgeColors=(category:Category,value:string)=>{
  const named=toneHue(toneOfValue(category,value));
  const [h,sat]=legacy.get(category+":"+value)??(category==="vertical"?verticalTone(value):category==="status"||category==="review"||category==="priority"?named:isPlaceholder(value)?toneHue("slate"):hashTone(value));
  const tint=`hsl(${h} ${Math.max(45,sat)}% 52%)`;
  // Text colour comes from the .badge class (light-dark inside @supports; foreground colour otherwise) using these hue variables.
  const tokenized=category==="status"||category==="review"||category==="priority"||isPlaceholder(value);
  const tone=toneToken(isPlaceholder(value)?"slate":toneOfValue(category,value));
  return {
    backgroundColor:tokenized?`var(--tone-${tone}-soft)`: `color-mix(in srgb, ${tint} 15%, var(--card))`,
    color:tokenized?`var(--tone-${tone}-ink)`:undefined,
    borderColor:"transparent",
    "--badge-h":String(h),
    "--badge-s":`${Math.min(85,sat+10)}%`,
  } as React.CSSProperties;
};

const badgeLabel=(category:Category,value:string)=>{
  if(category!=="city")return value;
  const normalized=value.trim().normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase("es-AR");
  return normalized==="concepcion del uruguay"?"C. del Uruguay":value;
};

export const ValueBadge=({
  value,category="generic",muted=false,className,nativeTooltip=true
}:{
  value:string;
  category?:Category;
  muted?:boolean;
  className?:string;
  nativeTooltip?:boolean;
})=>{
  if(!value)return <span className={styles.empty}>—</span>;
  return <Badge component="span" tt="none" variant="outline" classNames={{ label: styles.label }} className={styles.badge+" "+(muted?styles.muted:"")+" "+(className??"")} style={muted||isPlaceholder(value)?valueBadgeColors('status',''):valueBadgeColors(category,value)} title={nativeTooltip?value:undefined}>{category==="status"&&<span className={styles.dot} aria-hidden="true"/>}{badgeLabel(category,value)}</Badge>;
};

export type BadgeCategory=Category;
