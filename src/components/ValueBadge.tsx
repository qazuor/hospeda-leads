import React from "react";
import { Badge } from "@mantine/core";
import {businessStatusLabels} from "../helpers/businessStatus";
import {managementStageCatalog,managementTypes} from "../helpers/businessManagement";
import styles from "./ValueBadge.module.css";

type Category="vertical"|"subtype"|"status"|"priority"|"city"|"person"|"contact"|"profile"|"generic";

type Tone=[number,number];
const tones={neutral:[215,12],info:[204,72],progress:[225,65],warning:[32,90],violet:[270,60],muted:[215,8],success:[145,60],dangerMuted:[0,35]} satisfies Record<string,Tone>;
export type BadgeTone=keyof typeof tones;

// Legacy Floot statuses keep their own hue; everything else resolves to a semantic tone.
const legacy=new Map<string,Tone>(Object.entries({
  "status:Cargado":[215,12],
  "status:Filtrado":[210,76],
  "status:1er contacto":[190,74],
  "status:En tratativas":[38,90],
  "status:Suscripto":[143,61],
  "status:Promocionado a Leandro":[268,63],
  "status:Rechazado":[0,68],
  "status:No interesado":[355,43],
  "status:Re contactar mas adelante":[238,55],
  "priority:alta":[0,68],
  "priority:media":[38,90],
  "priority:baja":[143,52],
  "profile:Independiente":[162,57],
  "profile:Consolidado":[205,69],
  "profile:Referente":[274,61],
} as Record<string,Tone>));

const businessStatusTones=new Map<string,BadgeTone>(Object.entries({
  [businessStatusLabels.new]:"info",
  [businessStatusLabels.reviewed]:"neutral",
  [businessStatusLabels.in_management]:"progress",
  [businessStatusLabels.no_follow_up_scheduled]:"warning",
  "Sin tarea agendada":"warning",
  [businessStatusLabels.recontact]:"violet",
  [businessStatusLabels.archived]:"muted",
} as Record<string,BadgeTone>));
const classificationTones={open:"progress",won:"success",lost:"dangerMuted"} as const;
const stageTones=new Map<string,BadgeTone>(managementTypes.flatMap(type=>managementStageCatalog(type).map(stage=>[stage.label,classificationTones[stage.classification]] as const)));

/** Semantic tone of a status or stage label: business status, then stage classification, then neutral. */
export const badgeTone=(category:Category,value:string):BadgeTone=>category==="status"?businessStatusTones.get(value)??stageTones.get(value)??"neutral":"neutral";

export const valueBadgeColors=(category:Category,value:string)=>{
  const [h,sat]=legacy.get(category+":"+value)??tones[badgeTone(category,value)]??tones.neutral;
  const tint=`hsl(${h} ${Math.max(45,sat)}% 52%)`;
  // Text colour comes from the .badge class (light-dark inside @supports; foreground colour otherwise) using these hue variables.
  return {
    backgroundColor:`color-mix(in srgb, ${tint} 15%, var(--card))`,
    borderColor:`color-mix(in srgb, ${tint} 34%, var(--border))`,
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
  return <Badge component="span" tt="none" variant="outline" classNames={{ label: styles.label }} className={styles.badge+" "+(muted?styles.muted:"")+" "+(className??"")} style={valueBadgeColors(category,value)} title={nativeTooltip?value:undefined}>{badgeLabel(category,value)}</Badge>;
};

export type BadgeCategory=Category;
