import { z } from "zod";
import { User } from "../../helpers/User";
import superjson from "superjson";

export const sexSchema=z.enum(["masculino","femenino","otro","prefiero_no_decir"]);

export const schema=z.object({
  email:z.string().email("Ingresá un email válido"),
  fullName:z.string().min(2,"Ingresá tu nombre completo"),
  displayName:z.string().min(1,"Ingresá tu nombre visible"),
  phone:z.string().min(4,"Ingresá tu teléfono"),
  sex:sexSchema,
  password:z.string().min(8,"La contraseña debe tener al menos 8 caracteres"),
  inviteToken:z.string().min(32).optional(),
});

export type OutputType={user:User};

export const postRegister=async(body:z.infer<typeof schema>,init?:RequestInit):Promise<OutputType>=>{
  const validatedInput=schema.parse(body);
  const result=await fetch("/_api/auth/register_with_password",{
    method:"POST",
    body:superjson.stringify(validatedInput),
    ...init,
    headers:{"Content-Type":"application/json",...(init?.headers??{})},
    credentials:"include"
  });
  if(!result.ok){
    const errorData=superjson.parse<{message:string}>(await result.text());
    throw new Error(errorData.message||"No se pudo crear el acceso");
  }
  return superjson.parse<OutputType>(await result.text());
};
