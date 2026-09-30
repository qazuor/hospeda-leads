import { z } from "zod";
import superjson from "superjson";

export const schema=z.object({leadId:z.union([z.string(),z.number()])});
export type NoteItem={id:string;leadId:string;note:string;author:string|null;createdAt:Date|string};
export type OutputType={notes:NoteItem[]};
export const getLeadNotes=async(input:z.infer<typeof schema>):Promise<OutputType>=>{
  const p=schema.parse(input);
  const r=await fetch("/_api/lead_notes?leadId="+encodeURIComponent(String(p.leadId)));
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};