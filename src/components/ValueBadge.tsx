import React from "react";
import { Badge } from "@mantine/core";
import styles from "./ValueBadge.module.css";

type Category="vertical"|"subtype"|"status"|"priority"|"city"|"person"|"contact"|"profile"|"generic";

const hashHue=(value:string)=>{
  let hash=0;
  for(let i=0;i<value.length;i++)hash=(hash*31+value.charCodeAt(i))|0;
  return Math.abs(hash)%360;
};

const fixed:Record<string,[number,number,number]>={
  "vertical:Alojamiento":[204,72,44],
  "vertical:Gastronomía":[24,88,48],
  "vertical:Experiencia":[272,67,50],
  "vertical:Partner":[174,65,38],
  "vertical:Proveedor de servicios":[224,57,48],
  "vertical:Editor":[330,62,49],
  "status:Cargado":[215,12,46],
  "status:Filtrado":[210,76,48],
  "status:1er contacto":[190,74,42],
  "status:En tratativas":[38,90,42],
  "status:Suscripto":[143,61,36],
  "status:Promocionado a Leandro":[268,63,48],
  "status:Rechazado":[0,68,49],
  "status:No interesado":[355,43,45],
  "status:Re contactar mas adelante":[238,55,52],
  "priority:alta":[0,68,49],
  "priority:media":[38,90,42],
  "priority:baja":[143,52,37],
  "profile:Independiente":[162,57,38],
  "profile:Consolidado":[205,69,45],
  "profile:Referente":[274,61,48],
};

export const valueBadgeColors=(category:Category,value:string)=>{
  const key=category+":"+value;
  const tuple=fixed[key]??[hashHue(category+"|"+value),58,44];
  const [h,s,l]=tuple;
  return {
    backgroundColor:`color-mix(in srgb, hsl(${h} ${Math.max(45,s)}% 52%) 15%, var(--card))`,
    color:`color-mix(in srgb, hsl(${h} ${Math.min(85,s+10)}% 55%) 72%, var(--foreground))`,
    borderColor:`color-mix(in srgb, hsl(${h} ${Math.max(45,s)}% 52%) 34%, var(--border))`,
  } as React.CSSProperties;
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
  return <Badge component="span" tt="none" variant="outline" className={styles.badge+" "+(muted?styles.muted:"")+" "+(className??"")} style={valueBadgeColors(category,value)} title={nativeTooltip?value:undefined}>{value}</Badge>;
};

export type BadgeCategory=Category;