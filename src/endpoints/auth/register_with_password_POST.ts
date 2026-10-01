import { createHash, randomBytes } from "node:crypto";
import superjson from "superjson";
import { db } from "../../helpers/db";
import { schema } from "./register_with_password_POST.schema";
import { setServerSession,SessionExpirationSeconds } from "../../helpers/getSetServerSession";
import { generatePasswordHash } from "../../helpers/generatePasswordHash";

const INVITE_PREFIX="user_invitation:";

const pendingInvitationForUser=async(userId:number)=>{
  const rows=await db.selectFrom("appSettings").select(["key","value"]).where("key","like",INVITE_PREFIX+"%").execute();
  for(const row of rows){
    try{
      const invitation=JSON.parse(row.value) as {userId:number;expiresAt:string};
      if(invitation.userId===userId&&new Date(invitation.expiresAt).getTime()>Date.now())return true;
    }catch{}
  }
  return false;
};

const deleteInvitationsForUser=async(userId:number)=>{
  const rows=await db.selectFrom("appSettings").select(["key","value"]).where("key","like",INVITE_PREFIX+"%").execute();
  const keys=rows.flatMap(row=>{
    try{
      const invitation=JSON.parse(row.value) as {userId?:number};
      return invitation.userId===userId?[row.key]:[];
    }catch{return []}
  });
  if(keys.length)await db.deleteFrom("appSettings").where("key","in",keys).execute();
};

export async function handle(request:Request){
  try{
    const json=superjson.parse(await request.text());
    const {email,fullName,displayName,phone,sex,password,inviteToken}=schema.parse(json);
    const normalizedEmail=email.trim().toLowerCase();

    const allowed=await db.selectFrom("authorizedEmails")
      .select(["email","active"])
      .where(eb=>eb.fn("lower",["email"]),"=",normalizedEmail)
      .where("active","=",true)
      .executeTakeFirst();

    if(!allowed){
      return new Response(superjson.stringify({message:"Este correo no está autorizado para acceder a Hospeda Leads."}),{
        status:403,headers:{"Content-Type":"application/json"}
      });
    }

    const existingUser=await db.selectFrom("users")
      .leftJoin("userPasswords","users.id","userPasswords.userId")
      .select([
        "users.id","users.email","users.displayName","users.fullName","users.avatarUrl","users.role","users.createdAt",
        "userPasswords.id as passwordId"
      ])
      .where(eb=>eb.fn("lower",["users.email"]),"=",normalizedEmail)
      .limit(1)
      .executeTakeFirst();

    if(existingUser?.passwordId){
      return new Response(superjson.stringify({message:"Ese usuario ya tiene acceso creado. Ingresá desde la pantalla de login."}),{
        status:409,headers:{"Content-Type":"application/json"}
      });
    }

    let invitationValid=false;
    if(inviteToken){
      const hash=createHash("sha256").update(inviteToken).digest("hex");
      const row=await db.selectFrom("appSettings").select("value").where("key","=",INVITE_PREFIX+hash).executeTakeFirst();
      if(!row){
        return new Response(superjson.stringify({message:"La invitación no existe, venció o ya fue utilizada."}),{
          status:403,headers:{"Content-Type":"application/json"}
        });
      }
      const invitation=JSON.parse(row.value) as {userId:number;email:string;expiresAt:string};
      invitationValid=!!existingUser
        && invitation.userId===existingUser.id
        && invitation.email.toLowerCase()===normalizedEmail
        && new Date(invitation.expiresAt).getTime()>Date.now();

      if(!invitationValid){
        return new Response(superjson.stringify({message:"La invitación ya no es válida para este usuario."}),{
          status:403,headers:{"Content-Type":"application/json"}
        });
      }
    }else if(existingUser&&await pendingInvitationForUser(existingUser.id)){
      return new Response(superjson.stringify({message:"Usá el enlace de invitación que recibiste por email para completar tu usuario."}),{
        status:403,headers:{"Content-Type":"application/json"}
      });
    }

    const passwordHash=await generatePasswordHash(password);
    const defaultRole=normalizedEmail===(process.env.ADMIN_EMAIL??"").toLowerCase()?("admin" as const):("user" as const);

    const newUser=await db.transaction().execute(async trx=>{
      if(existingUser){
        await trx.updateTable("users").set({
          fullName:fullName.trim(),
          displayName:displayName.trim(),
          phone:phone.trim(),
          sex,
          updatedAt:new Date()
        }).where("id","=",existingUser.id).execute();

        await trx.insertInto("userPasswords").values({userId:existingUser.id,passwordHash}).execute();

        await trx.updateTable("authorizedEmails").set({displayName:displayName.trim(),active:true})
          .where(eb=>eb.fn("lower",["email"]),"=",normalizedEmail).execute();

        return {
          id:existingUser.id,
          email:existingUser.email,
          displayName:displayName.trim(),
          fullName:fullName.trim(),
          avatarUrl:existingUser.avatarUrl,
          role:existingUser.role,
          createdAt:existingUser.createdAt
        };
      }

      const [user]=await trx.insertInto("users").values({
        email:normalizedEmail,
        fullName:fullName.trim(),
        displayName:displayName.trim(),
        phone:phone.trim(),
        sex,
        senderEmail:null,
        role:defaultRole
      }).returning(["id","email","displayName","fullName","avatarUrl","role","createdAt"]).execute();

      await trx.insertInto("userPasswords").values({userId:user.id,passwordHash}).execute();
      return user;
    });

    await deleteInvitationsForUser(newUser.id);

    const sessionId=randomBytes(32).toString("hex");
    const now=new Date();
    const expiresAt=new Date(now.getTime()+SessionExpirationSeconds*1000);
    await db.insertInto("sessions").values({
      id:sessionId,userId:newUser.id,createdAt:now,lastAccessed:now,expiresAt
    }).execute();

    const response=new Response(superjson.stringify({user:{...newUser,role:newUser.role}}),{
      headers:{"Content-Type":"application/json"}
    });
    await setServerSession(response,{id:sessionId,createdAt:now.getTime(),lastAccessed:now.getTime()});
    return response;
  }catch(error:unknown){
    console.error("Registration error:",error);
    return new Response(superjson.stringify({
      message:error instanceof Error?error.message:"No se pudo crear el acceso"
    }),{status:400,headers:{"Content-Type":"application/json"}});
  }
}
