import { z } from "zod";
import {apiJson} from "../helpers/apiClient";
export type Bucket={name:string;count:number};
export type ConversionBucket={name:string;total:number;subscribed:number;rate:number};
export type DurationBucket={name:string;days:number;samples:number};
export const schema=z.object({from:z.string().optional(),to:z.string().optional(),responsible:z.string().optional(),type:z.string().optional(),city:z.string().optional()});
export type OutputType={
  pipelineOpen:number;pipelineWon:number;pipelineLost:number;lossReasons:Bucket[];
  total:number;pending:number;subscribed:number;overdue:number;withPhone:number;withEmail:number;withWebsite:number;
  noContact:number;inactive30:number;contacted:number;conversionRate:number;new7:number;avgDaysToFirstContact:number|null;firstContactSamples:number;
  byCity:Bucket[];byStatus:Bucket[];byType:Bucket[];bySubtype:Bucket[];byOrigin:Bucket[];byPriority:Bucket[];byResponsible:Bucket[];
  byTypeConversion:ConversionBucket[];byResponsibleConversion:ConversionBucket[];avgDaysByStatus:DurationBucket[];createdByDay:{date:string;count:number}[];
};
export const getAnalytics=async(input:z.input<typeof schema>={}):Promise<OutputType>=>{
  const p=schema.parse(input);const qs=new URLSearchParams();Object.entries(p).forEach(([k,v])=>{if(v)qs.set(k,v)});
  return apiJson<OutputType>("/_api/analytics"+(qs.size?"?"+qs.toString():""));
};