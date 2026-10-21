import {z} from "zod";
import {postJson} from "../../helpers/apiClient";
export const requestSchema=z.object({email:z.string().trim().toLowerCase().email().max(254)});
export const resetSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(8,"La contraseña debe tener al menos 8 caracteres").max(72,"La contraseña debe tener como máximo 72 caracteres").refine(value=>new TextEncoder().encode(value).length<=72,"La contraseña supera el límite de 72 bytes; usá menos caracteres"),confirmation:z.string()}).refine(v=>v.password===v.confirmation,{message:"Las contraseñas no coinciden",path:["confirmation"]});
export async function recoverPassword(action:"request"|"reset",body:unknown){
 return postJson<{message:string}>(`/_api/auth/password_recovery/${action}`,body,{sessionEvent:false});
}
