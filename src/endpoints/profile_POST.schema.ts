import { z } from "zod";
import superjson from "superjson";
export const schema=z.object({
  displayName:z.string().trim().min(1).max(120),
  fullName:z.string().trim().max(180).nullable(),
  phone:z.string().trim().max(80).nullable(),
  sex:z.enum(["masculino","femenino","otro","prefiero_no_decir"]).nullable()
});
export type InputType=z.infer<typeof schema>;
export type OutputType={ok:true;user:{id:number;email:string;displayName:string;avatarUrl:string|null;role:"admin"|"user"}};
export const postProfile=async(body:InputType):Promise<OutputType>=>{
  const r=await fetch("/_api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(schema.parse(body))});
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};