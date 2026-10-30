import { getOpportunityStages } from "../helpers/commercialStages";
import superjson from "superjson";
import { globalAutoRegisterEnabled } from "../helpers/autoRegistration";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { SettingsOutput } from "./settings_GET.schema";
import {sql} from 'kysely';
import { withDefaultMessageVariables } from "../helpers/messageVariables";
import {errorResponse} from '../helpers/errorResponse';
import {templateMaterialRefs} from '../helpers/templateMaterialService';

type StoredInvitation={userId:number;email:string;expiresAt:string};

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const admin=user.role==="admin";
    const [cities,subtypes,authorizedEmails,users,passwordRows,templates,typesRows,emailSettings,invitationSettings,opportunityStages,templateVersions,variableSettings]=await Promise.all([
      db.selectFrom("crmCities").select(["id","name"]).where("active","=",true).orderBy("name").execute(),
      db.selectFrom("crmSubtypes").select(["id","typeName","name"]).where("active","=",true).orderBy("name").execute(),
      admin?db.selectFrom("authorizedEmails").select(["id","email","displayName"]).where("active","=",true).orderBy("email").execute():Promise.resolve([]),
      admin?db.selectFrom("users").select(["id","email","fullName","displayName","phone","sex","senderEmail","role"]).orderBy("displayName").execute():db.selectFrom("users").select(["id","email","displayName","role"]).orderBy("displayName").execute(),
      admin?db.selectFrom("userPasswords").select("userId").execute():Promise.resolve([]),
      admin?db.selectFrom("messageTemplates").select(["id","channel","name","subject","body","vertical","managementType","commercialProfile","purpose","active"]).orderBy("managementType").orderBy("vertical").orderBy("commercialProfile").orderBy("purpose").orderBy("channel").orderBy("name").execute():db.selectFrom("messageTemplates").select(["id","channel","name","subject","body","vertical","managementType","commercialProfile","purpose","active"]).where("active","=",true).orderBy("managementType").orderBy("vertical").orderBy("commercialProfile").orderBy("purpose").orderBy("channel").orderBy("name").execute(),
      db.selectFrom("crmVerticals").select("name").where("active","=",true).orderBy("sortOrder").orderBy("name").execute(),
      db.selectFrom("appSettings").select(["key","value"]).where("key","in",[
        ...(admin?["brevo_sender_name","brevo_sender_email","brevo_reply_to_email","crm_userscript_auto_register"]:[]),"crm_contact_positions","crm_contact_channels"
      ]).execute(),
      admin?db.selectFrom("appSettings").select(["key","value"]).where("key","like","user_invitation:%").execute():Promise.resolve([]),
      getOpportunityStages(db),
      admin?sql<any>`SELECT template_id::text AS "templateId",version,snapshot,actor_email AS "actorEmail",created_at AS "createdAt" FROM crm_message_template_versions ORDER BY template_id,version DESC`.execute(db).then(r=>r.rows):Promise.resolve([]),
      admin?db.selectFrom("appSettings").select("value").where("key","=","crm_message_variables").executeTakeFirst():Promise.resolve(undefined)
    ]);

    const emailConfig=Object.fromEntries(emailSettings.map(row=>[row.key,row.value]));
    const passwordUserIds=new Set(passwordRows.map(row=>row.userId));
    const pendingInvitationUserIds=new Set<number>();
    const now=Date.now();
    for(const row of invitationSettings){
      try{
        const invitation=JSON.parse(row.value) as StoredInvitation;
        if(invitation.userId&&new Date(invitation.expiresAt).getTime()>now)pendingInvitationUserIds.add(invitation.userId);
      }catch{}
    }

    // Sales material references of each template, with title and availability, so no uuid reaches the user (spec 89 §9).
    const materialRefs=await templateMaterialRefs(db,{templates:templates.map(t=>({id:String(t.id),body:t.body}))});
    const out:SettingsOutput={
      cities:cities.map(x=>({...x,id:String(x.id)})),
      subtypes:subtypes.map(x=>({...x,id:String(x.id)})),
      authorizedEmails:authorizedEmails.map(x=>({...x,id:String(x.id)})),
      users:users.map(user=>admin?({
        ...user,
        hasPassword:passwordUserIds.has(user.id),
        invitationPending:pendingInvitationUserIds.has(user.id)
      }):({id:user.id,email:user.email,displayName:user.displayName,role:user.role})),
      templates:templates.map(x=>({...x,id:String(x.id),materialRefs:materialRefs[String(x.id)]??[]})),
      ...(admin?{templateVersions}:{}),
      ...(admin?{messageVariables:withDefaultMessageVariables(variableSettings?.value?JSON.parse(variableSettings.value):null)}:{}),
      ...(admin?{emailDelivery:{
        senderName:emailConfig.brevo_sender_name||"Hospeda",
        senderEmail:emailConfig.brevo_sender_email||"notificaciones@hospeda.com.ar",
        replyToEmail:emailConfig.brevo_reply_to_email||"contacto@hospeda.com.ar",
        brevoConnected:!!(process.env as Record<string,string|undefined>).BREVO_API_KEY
      }}:{}),
      ...(admin?{userscriptAutoRegister:{enabled:globalAutoRegisterEnabled({value:emailConfig.crm_userscript_auto_register})}}:{}),
      contactPositions:JSON.parse(emailConfig.crm_contact_positions||"[]"),
      contactChannels:JSON.parse(emailConfig.crm_contact_channels||"[]"),
      opportunityStages,
      types:typesRows.map(x=>x.name)
    };
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return errorResponse(error);
  }
}
