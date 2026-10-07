import {CrmForbidden,assertLeadAccess} from '../helpers/crmPermissions';
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./lead_notes_POST.schema";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    const row=await db.transaction().execute(async trx=>{
      const lead=await assertLeadAccess(trx,String(input.leadId),user,true);
      if(lead.deletedAt)throw new Error("Este lead está en la papelera. Restauralo antes de agregar notas.");
      const note=await trx.insertInto("leadNotes").values({leadId:String(input.leadId),note:input.note,author:user.displayName}).returning("id").executeTakeFirstOrThrow();
      await writeLeadJournal(trx,{
        leadId:String(lead.id),leadName:lead.nombre,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"note_added",
        changes:[{fieldName:"note",oldValue:null,newValue:input.note}],
        metadata:{noteId:String(note.id)}
      });
      return note;
    });
    return new Response(superjson.stringify({id:String(row.id)} satisfies OutputType));
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo guardar la nota"}),{status:error instanceof CrmForbidden?403:400});
  }
}