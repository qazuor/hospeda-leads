import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { SettingsOutput } from "./settings_GET.schema";

type StoredInvitation={userId:number;email:string;expiresAt:string};

export async function handle(request:Request){
  try{
    await getServerUserSession(request);
    const [cities,subtypes,authorizedEmails,users,passwordRows,templates,typesRows,emailSettings,userSenderSettings,invitationSettings]=await Promise.all([
      db.selectFrom("crmCities").select(["id","name"]).where("active","=",true).orderBy("name").execute(),
      db.selectFrom("crmSubtypes").select(["id","typeName","name"]).where("active","=",true).orderBy("name").execute(),
      db.selectFrom("authorizedEmails").select(["id","email","displayName"]).where("active","=",true).orderBy("email").execute(),
      db.selectFrom("users").select(["id","email","displayName","role"]).orderBy("displayName").execute(),
      db.selectFrom("userPasswords").select("userId").execute(),
      db.selectFrom("messageTemplates").select(["id","channel","name","subject","body","vertical","commercialProfile"]).where("active","=",true).orderBy("vertical").orderBy("commercialProfile").orderBy("channel").orderBy("name").execute(),
      db.selectFrom("crmVerticals").select("name").where("active","=",true).orderBy("sortOrder").orderBy("name").execute(),
      db.selectFrom("appSettings").select(["key","value"]).where("key","in",[
        "brevo_sender_name","brevo_sender_email","brevo_reply_to_email"
      ]).execute(),
      db.selectFrom("appSettings").select(["key","value"]).where("key","like","brevo_user_sender_email:%").execute(),
      db.selectFrom("appSettings").select(["key","value"]).where("key","like","user_invitation:%").execute()
    ]);
    const emailConfig=Object.fromEntries(emailSettings.map(row=>[row.key,row.value]));
    const senderPrefix="brevo_user_sender_email:";
    const userSenderMap=new Map(userSenderSettings.map(row=>[Number(row.key.slice(senderPrefix.length)),row.value]));
    const passwordUserIds=new Set(passwordRows.map(row=>row.userId));
    const now=Date.now();
    const pendingInvitationUserIds=new Set<number>();
    for(const row of invitationSettings){
      try{
        const invitation=JSON.parse(row.value) as StoredInvitation;
        if(invitation.userId&&new Date(invitation.expiresAt).getTime()>now)pendingInvitationUserIds.add(invitation.userId);
      }catch{}
    }
    const out:SettingsOutput={
      cities:cities.map(x=>({...x,id:String(x.id)})),
      subtypes:subtypes.map(x=>({...x,id:String(x.id)})),
      authorizedEmails:authorizedEmails.map(x=>({...x,id:String(x.id)})),
      users:users.map(user=>({
        ...user,
        senderEmail:userSenderMap.get(user.id)??null,
        hasPassword:passwordUserIds.has(user.id),
        invitationPending:pendingInvitationUserIds.has(user.id)
      })),
      templates:templates.map(x=>({...x,id:String(x.id)})),
      emailDelivery:{
        senderName:emailConfig.brevo_sender_name||"Hospeda",
        senderEmail:emailConfig.brevo_sender_email||"notificaciones@hospeda.com.ar",
        replyToEmail:emailConfig.brevo_reply_to_email||"contacto@hospeda.com.ar",
        brevoConnected:!!(process.env as Record<string,string|undefined>).BREVO_API_KEY
      },
      types:typesRows.map(x=>x.name)
    };
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo cargar configuración"}),{status:400});
  }
}
