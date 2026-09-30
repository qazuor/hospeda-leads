import { createHash } from "node:crypto";
import superjson from "superjson";
import { db } from "../../helpers/db";
import type { InvitationOutput } from "./invitation_GET.schema";

export async function handle(request:Request){
  try{
    const token=new URL(request.url).searchParams.get("token")?.trim()??"";
    if(token.length<32)return new Response(superjson.stringify({error:"La invitación no es válida."}),{status:400});

    const hash=createHash("sha256").update(token).digest("hex");
    const row=await db.selectFrom("appSettings").select("value")
      .where("key","=","user_invitation:"+hash).executeTakeFirst();

    if(!row)return new Response(superjson.stringify({error:"La invitación no existe, venció o ya fue utilizada."}),{status:404});

    const invitation=JSON.parse(row.value) as {userId:number;email:string;expiresAt:string};
    if(new Date(invitation.expiresAt).getTime()<=Date.now()){
      await db.deleteFrom("appSettings").where("key","=","user_invitation:"+hash).execute();
      return new Response(superjson.stringify({error:"La invitación venció. Pedile a un administrador que la reenvíe."}),{status:410});
    }

    const user=await db.selectFrom("users").select("email").where("id","=",invitation.userId).executeTakeFirst();
    if(!user||user.email.toLowerCase()!==invitation.email.toLowerCase()){
      return new Response(superjson.stringify({error:"La invitación ya no corresponde a este usuario."}),{status:409});
    }

    return new Response(superjson.stringify({email:user.email} satisfies InvitationOutput),{
      headers:{"Content-Type":"application/json"}
    });
  }catch(error){
    return new Response(superjson.stringify({
      error:error instanceof Error?error.message:"No pude validar la invitación."
    }),{status:400});
  }
}
