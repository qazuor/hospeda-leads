import { z } from "zod";
import superjson from "superjson";

export const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("addCity"),name:z.string().min(1)}),
  z.object({action:z.literal("addSubtype"),name:z.string().min(1),typeName:z.string().nullable().optional()}),
  z.object({action:z.literal("addEmail"),email:z.string().email(),displayName:z.string().nullable().optional()}),
  z.object({
    action:z.literal("saveEmailDelivery"),
    senderName:z.string().min(1),
    senderEmail:z.string().email(),
    replyToEmail:z.string().email()
  }),
  z.object({
    action:z.literal("saveTemplate"),
    id:z.union([z.string(),z.number()]).optional(),
    channel:z.enum(["email","whatsapp"]),
    name:z.string().min(1),
    subject:z.string().nullable().optional(),
    body:z.string().min(1),
    vertical:z.string().nullable().optional(),
    commercialProfile:z.enum(["Independiente","Consolidado","Referente"]).nullable().optional()
  })
]);
export type InputType=z.infer<typeof schema>;
export type OutputType={ok:true};
export const postSettingsSave=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/settings_save",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};