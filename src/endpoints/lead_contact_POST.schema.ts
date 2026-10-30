import { z } from "zod";
import {postJson} from "../helpers/apiClient";
export const schema=z.object({
  contactId:z.string().regex(/^[1-9]\d*$/).nullable().optional(),
  leadId:z.union([z.string(),z.number()]),
  channel:z.enum(["whatsapp","email","phone","other"]),
  result:z.enum(["Sin respuesta","Respondió","Interesado","Recontactar","No interesado"]),
  nextAction:z.string().nullable().optional()
});
export type InputType=z.infer<typeof schema>;
export type OutputType={ok:true};
export const postLeadContact=async(body:InputType):Promise<OutputType>=>{
  return postJson<OutputType>("/_api/lead_contact",schema.parse(body));
};