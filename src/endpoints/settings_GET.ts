import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { SettingsOutput } from "./settings_GET.schema";

export async function handle(request:Request){
  try{
    await getServerUserSession(request);
    const [cities,subtypes,authorizedEmails,users,templates,typesRows,emailSettings]=await Promise.all([
      db.selectFrom("crmCities").select(["id","name"]).where("active","=",true).orderBy("name").execute(),
      db.selectFrom("crmSubtypes").select(["id","typeName","name"]).where("active","=",true).orderBy("name").execute(),
      db.selectFrom("authorizedEmails").select(["id","email","displayName"]).where("active","=",true).orderBy("email").execute(),
      db.selectFrom("users").select(["id","email","displayName","role"]).orderBy("displayName").execute(),
      db.selectFrom("messageTemplates").select(["id","channel","name","subject","body","vertical","commercialProfile"]).where("active","=",true).orderBy("vertical").orderBy("commercialProfile").orderBy("channel").orderBy("name").execute(),
      db.selectFrom("crmVerticals").select("name").where("active","=",true).orderBy("sortOrder").orderBy("name").execute(),
      db.selectFrom("appSettings").select(["key","value"]).where("key","in",[
        "brevo_sender_name","brevo_sender_email","brevo_reply_to_email"
      ]).execute()
    ]);
    const emailConfig=Object.fromEntries(emailSettings.map(row=>[row.key,row.value]));
    const out:SettingsOutput={
      cities:cities.map(x=>({...x,id:String(x.id)})),
      subtypes:subtypes.map(x=>({...x,id:String(x.id)})),
      authorizedEmails:authorizedEmails.map(x=>({...x,id:String(x.id)})),
      users,
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