import { z } from "zod";
import {postJson} from "../helpers/apiClient";
export const schema=z.object({leadId:z.union([z.string(),z.number()]),note:z.string().trim().min(1)});
export type OutputType={id:string};
export const postLeadNote=async(input:z.infer<typeof schema>):Promise<OutputType>=>{
  return postJson<OutputType>("/_api/lead_notes",schema.parse(input));
};