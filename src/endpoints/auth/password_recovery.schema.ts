import {z} from "zod";
import superjson from "superjson";
export const requestSchema=z.object({email:z.string().trim().toLowerCase().email().max(254)});
export const resetSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(8,"La contraseña debe tener al menos 8 caracteres").max(72,"La contraseña debe tener como máximo 72 caracteres").refine(value=>new TextEncoder().encode(value).length<=72,"La contraseña supera el límite de 72 bytes; usá menos caracteres"),confirmation:z.string()}).refine(v=>v.password===v.confirmation,{message:"Las contraseñas no coinciden",path:["confirmation"]});
export async function recoverPassword(action:"request"|"reset",body:unknown){
 const response=await fetch(`/_api/auth/password_recovery/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:superjson.stringify(body)});
 const result=superjson.parse<{message:string}>(await response.text());
 if(!response.ok)throw new Error(result.message);
 return result;
}
