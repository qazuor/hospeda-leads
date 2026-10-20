import { z } from "zod";
import {apiJson} from "../helpers/apiClient";

export const schema=z.object({leadId:z.union([z.string(),z.number()])});
export type NoteItem={id:string;leadId:string;note:string;author:string|null;createdAt:Date|string};
export type OutputType={notes:NoteItem[]};
export const getLeadNotes=async(input:z.infer<typeof schema>):Promise<OutputType>=>{
  const p=schema.parse(input);
  return apiJson<OutputType>("/_api/lead_notes?leadId="+encodeURIComponent(String(p.leadId)));
};