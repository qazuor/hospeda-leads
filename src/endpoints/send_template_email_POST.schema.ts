import { z } from "zod";
import superjson from "superjson";

export const schema=z.object({
  leadId:z.union([z.string(),z.number()]),
  templateId:z.union([z.string(),z.number()])
});
export type InputType=z.infer<typeof schema>;
export type OutputType={
  ok:true;
  messageId:string;
  outboxId:string;
};

export const postSendTemplateEmail=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/send_template_email",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:superjson.stringify(schema.parse(body))
  });
  if(!r.ok){
    const e=superjson.parse<{error:string}>(await r.text());
    throw new Error(e.error||"No se pudo enviar el email");
  }
  return superjson.parse<OutputType>(await r.text());
};