import { z } from "zod";
import superjson from "superjson";
export type Bucket={name:string;count:number};
export type ConversionBucket={name:string;total:number;subscribed:number;rate:number};
export const schema=z.object({from:z.string().optional(),to:z.string().optional(),responsible:z.string().optional(),type:z.string().optional(),city:z.string().optional()});
export type OutputType={
  total:number;pending:number;subscribed:number;overdue:number;withPhone:number;withEmail:number;withWebsite:number;
  noContact:number;inactive30:number;contacted:number;conversionRate:number;
  byCity:Bucket[];byStatus:Bucket[];byType:Bucket[];bySubtype:Bucket[];byOrigin:Bucket[];byPriority:Bucket[];byResponsible:Bucket[];
  byTypeConversion:ConversionBucket[];createdByDay:{date:string;count:number}[];
};
export const getAnalytics=async(input:z.input<typeof schema>={}):Promise<OutputType>=>{
  const p=schema.parse(input);const qs=new URLSearchParams();Object.entries(p).forEach(([k,v])=>{if(v)qs.set(k,v)});
  const r=await fetch("/_api/analytics"+(qs.size?"?"+qs.toString():""));
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};