import superjson from "superjson";
import { db } from "../helpers/db";
import { findLeadDuplicates } from "../helpers/findLeadDuplicates";
import { schema, type OutputType } from "./leads_ingest_POST.schema";
import { writeLeadJournal } from "../helpers/writeLeadJournal";

export async function handle(request:Request){
  try{
    const tokenRow=await db.selectFrom("appSettings").select("value").where("key","=","ingest_token").executeTakeFirst();
    const auth=request.headers.get("Authorization")??"";
    if(!tokenRow || auth!=="Bearer "+tokenRow.value){
      return new Response(superjson.stringify({error:"Ingest source not allowed"}),{status:403});
    }
    const input=schema.parse(superjson.parse(await request.text()));
    const createdIds:string[]=[];
    const duplicates:OutputType["duplicates"]=[];
    let skipped=0;
    for(const lead of input.leads){
      const matches=await findLeadDuplicates(lead);
      if(matches.length&&!input.force){
        skipped++;
        duplicates.push({nombre:lead.nombre,matches:matches.map(x=>x.id)});
        continue;
      }
      const created=await db.insertInto("leads").values({
        nombre:lead.nombre,
        contactName:lead.contactName??null,
        tipo:lead.tipo??null,
        subtipo:lead.subtipo??null,
        commercialProfile:lead.commercialProfile??null,
        ciudad:lead.ciudad??null,
        estado:lead.estado??"Cargado",
        suscripcion:lead.suscripcion??null,
        email:lead.email??null,
        telefono:lead.telefono??null,
        sitioWeb:lead.sitioWeb??null,
        urlGmap:lead.urlGmap??null,
        perfilInstagram:lead.perfilInstagram??null,
        perfilFacebook:lead.perfilFacebook??null,
        perfilAirbnb:lead.perfilAirbnb??null,
        perfilBooking:lead.perfilBooking??null,
        perfilTurismoEntreRios:lead.perfilTurismoEntreRios??null,
        origen:lead.origen??"Carga asistida",
        asignadoA:lead.asignadoA??null,
        assignedUserEmail:lead.assignedUserEmail??null,
        fuenteReferencia:lead.fuenteReferencia??null,
        prioridad:lead.prioridad??null,
        quienCargo:"Asistente",
        creadoPor:"Asistente",
        fechaCreacion:new Date(),
        updatedAt:new Date()
      }).returning("id").executeTakeFirstOrThrow();
      createdIds.push(String(created.id));
      await writeLeadJournal(db,{
        leadId:String(created.id),leadName:lead.nombre,
        actor:{id:null,email:null,displayName:"Asistente"},
        action:"created",
        metadata:{source:"ingest"}
      });
      if(lead.notas?.length){
        for(const note of lead.notas){
          const inserted=await db.insertInto("leadNotes").values({leadId:String(created.id),note,author:"Asistente"}).returning("id").executeTakeFirstOrThrow();
          await writeLeadJournal(db,{
            leadId:String(created.id),leadName:lead.nombre,
            actor:{id:null,email:null,displayName:"Asistente"},
            action:"note_added",
            changes:[{fieldName:"note",oldValue:null,newValue:note}],
            metadata:{noteId:String(inserted.id),source:"ingest"}
          });
        }
      }
    }
    const out={created:createdIds.length,skipped,createdIds,duplicates} satisfies OutputType;
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron cargar leads"}),{status:400});
  }
}