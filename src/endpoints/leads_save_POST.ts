import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./leads_save_POST.schema";
import { findLeadDuplicates } from "../helpers/findLeadDuplicates";
import { writeLeadJournal } from "../helpers/writeLeadJournal";

const dateOrNull = (value?: string | null) => value ? new Date(value + "T12:00:00") : null;
const comparable=(value:unknown)=>{
  if(value===null||value===undefined)return "";
  if(value instanceof Date)return value.toISOString();
  return String(value);
};

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if (!input.id && !input.force) {
      const duplicateCandidates = await findLeadDuplicates(input);
      if (duplicateCandidates.length) {
        return new Response(
          superjson.stringify({ duplicateCandidates } satisfies OutputType),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const id=await db.transaction().execute(async trx=>{
      const existing=input.id
        ? await trx.selectFrom("leads").selectAll().where("id","=",String(input.id)).executeTakeFirst()
        : undefined;
      if(input.id&&!existing)throw new Error("Lead no encontrado");
      if(existing?.deletedAt)throw new Error("Este lead está en la papelera. Restauralo antes de editarlo.");

      const values = {
        nombre: input.nombre,
        contactName: input.contactName ?? null,
        tipo: input.tipo ?? null,
        subtipo: input.subtipo ?? null,
        commercialProfile: input.commercialProfile ?? null,
        ciudad: input.ciudad ?? null,
        estado: input.estado ?? "Cargado",
        suscripcion: input.suscripcion ?? null,
        email: input.email ?? null,
        telefono: input.telefono ?? null,
        sitioWeb: input.sitioWeb ?? null,
        urlGmap: input.urlGmap ?? null,
        perfilInstagram: input.perfilInstagram ?? null,
        perfilFacebook: input.perfilFacebook ?? null,
        perfilAirbnb: input.perfilAirbnb ?? null,
        perfilBooking: input.perfilBooking ?? null,
        perfilTurismoEntreRios: input.perfilTurismoEntreRios ?? null,
        origen: input.origen ?? null,
        quienCargo: input.quienCargo ?? user.displayName,
        asignadoA: input.asignadoA ?? null,
        assignedUserEmail: input.assignedUserEmail ?? null,
        fechaCreacion: input.fechaCreacion!==undefined
          ? (dateOrNull(input.fechaCreacion) ?? existing?.fechaCreacion ?? new Date())
          : (existing?.fechaCreacion ?? new Date()),
        fechaUltimoContacto: dateOrNull(input.fechaUltimoContacto),
        medioContactoPreferido: input.medioContactoPreferido ?? null,
        resultadoUltimoContacto: input.resultadoUltimoContacto ?? null,
        prioridad: input.prioridad ?? null,
        fechaProximaAccion: dateOrNull(input.fechaProximaAccion),
        fuenteReferencia: input.fuenteReferencia ?? null,
        clientePotencialRecurrente: input.clientePotencialRecurrente ?? false,
        archivoAdjunto: input.archivoAdjunto ?? null,
        notas: null,
        creadoPor: input.creadoPor ?? existing?.creadoPor ?? user.displayName,
        updatedAt: new Date(),
      };

      let leadId:string;
      if(existing){
        const updated=await trx.updateTable("leads").set(values).where("id","=",String(existing.id)).returning("id").executeTakeFirstOrThrow();
        leadId=String(updated.id);
        const tracked=[
          "nombre","contactName","tipo","subtipo","commercialProfile","ciudad","estado","suscripcion","email","telefono",
          "sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb","perfilBooking",
          "perfilTurismoEntreRios","origen","quienCargo","asignadoA","assignedUserEmail","fechaCreacion","fechaUltimoContacto",
          "medioContactoPreferido","resultadoUltimoContacto","prioridad","fechaProximaAccion",
          "fuenteReferencia","clientePotencialRecurrente","archivoAdjunto"
        ] as const;
        const changes=tracked.flatMap(field=>
          comparable(existing[field])===comparable(values[field])
            ? []
            : [{fieldName:field,oldValue:existing[field],newValue:values[field]}]
        );
        if(changes.length){
          await writeLeadJournal(trx,{
            leadId,
            leadName:values.nombre,
            actor:{id:user.id,email:user.email,displayName:user.displayName},
            action:"updated",
            changes
          });
        }
      }else{
        const created=await trx.insertInto("leads").values(values).returning("id").executeTakeFirstOrThrow();
        leadId=String(created.id);
        await writeLeadJournal(trx,{
          leadId,
          leadName:values.nombre,
          actor:{id:user.id,email:user.email,displayName:user.displayName},
          action:"created"
        });
      }

      if(input.notas?.trim()){
        const note=await trx.insertInto("leadNotes").values({
          leadId,
          note:input.notas.trim(),
          author:user.displayName,
        }).returning("id").executeTakeFirstOrThrow();
        await writeLeadJournal(trx,{
          leadId,
          leadName:values.nombre,
          actor:{id:user.id,email:user.email,displayName:user.displayName},
          action:"note_added",
          changes:[{fieldName:"note",oldValue:null,newValue:input.notas.trim()}],
          metadata:{noteId:String(note.id)}
        });
      }
      return leadId;
    });

    return new Response(superjson.stringify({ id } satisfies OutputType), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : "No se pudo guardar el lead" }), { status: 400 });
  }
}
