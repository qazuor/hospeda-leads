import { z } from "zod";
import superjson from "superjson";
import type {SavedLeadView} from './saved_views_GET.schema';
export const viewSchema=z.object({name:z.string().trim().min(1).max(80),config:z.record(z.unknown())});
export const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),view:viewSchema}),
  z.object({action:z.literal("update"),id:z.string().min(1).max(100).optional(),name:z.string().trim().min(1).max(80),view:viewSchema}),
  z.object({action:z.literal("delete"),id:z.string().min(1).max(100).optional(),name:z.string().trim().min(1).max(80)})
]);
export type InputType=z.infer<typeof schema>;
export type OutputType={ok:true;view?:SavedLeadView};
export const postSavedLeadView=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/saved_views",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};
