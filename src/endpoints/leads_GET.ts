import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./leads_GET.schema";
import { schema } from "./leads_GET.schema";
import { sql } from "kysely";

export async function handle(request: Request) {
  try {
    await getServerUserSession(request);
    const url=new URL(request.url); const input=schema.parse(Object.fromEntries(url.searchParams));
    let query=db.selectFrom("leads").where("deletedAt","is",null);
    if(input.q){const s="%"+input.q.toLowerCase()+"%";query=query.where(eb=>eb.or([
      eb(sql<string>`lower(nombre)`,"like",s),
      eb(sql<string>`lower(coalesce(opportunity_name,''))`,"like",s),
      eb(sql<string>`lower(coalesce(contact_name,''))`,"like",s),
      eb(sql<string>`lower(coalesce(email,''))`,"like",s),
      eb(sql<string>`lower(coalesce(telefono,''))`,"like",s),
      eb(sql<string>`lower(coalesce(ciudad,''))`,"like",s),
      eb(sql<string>`lower(coalesce(origen,''))`,"like",s),
      eb.exists(
        eb.selectFrom("leadNotes")
          .select("leadNotes.id")
          .whereRef("leadNotes.leadId","=","leads.id")
          .where(sql<string>`lower(note)`,"like",s)
      )
    ]))}
    const includeCities=input.ciudades.length?input.ciudades:(input.ciudad?[input.ciudad]:[]);
    const includeStates=input.estados.length?input.estados:(input.estado?[input.estado]:[]);
    const includeTypes=input.tipos.length?input.tipos:(input.tipo?[input.tipo]:[]);
    const includeSubtypes=input.subtipos.length?input.subtipos:(input.subtipo?[input.subtipo]:[]);
    const includeProfiles=input.commercialProfiles.length?input.commercialProfiles:(input.commercialProfile?[input.commercialProfile]:[]);
    const includePriorities=input.prioridades.length?input.prioridades:(input.prioridad?[input.prioridad]:[]);
    const includeAssigned=input.asignados.length?input.asignados:(input.asignado?[input.asignado]:[]);
    const includeAssignedUsers=input.assignedUsers.length?input.assignedUsers:(input.assignedUser?[input.assignedUser]:[]);

    const applySetFilter=(column:any,include:string[],exclude:string[],allowBlank=true)=>{
      const includeEmpty=include.includes("__EMPTY__");
      const includeValues=include.filter(x=>x!=="__EMPTY__");
      if(includeValues.length||includeEmpty)query=query.where(eb=>eb.or([
        ...(includeValues.length?[eb(column,"in",includeValues as any)]:[]),
        ...(includeEmpty?[eb(column,"is",null)]:[]),
        ...(includeEmpty&&allowBlank?[eb(column,"=","")]:[])
      ]));
      const excludeEmpty=exclude.includes("__EMPTY__");
      const excludeValues=exclude.filter(x=>x!=="__EMPTY__");
      if(excludeValues.length)query=query.where(eb=>eb.or([eb(column,"is",null),eb(column,"not in",excludeValues as any)]));
      if(excludeEmpty){
        query=query.where(column,"is not",null);
        if(allowBlank)query=query.where(column,"!=","");
      }
    };
    applySetFilter("ciudad",includeCities,input.excludeCiudades);
    applySetFilter("estado",includeStates,input.excludeEstados);
    applySetFilter("tipo",includeTypes,input.excludeTipos);
    applySetFilter("subtipo",includeSubtypes,input.excludeSubtipos);
    applySetFilter("commercialProfile",includeProfiles,input.excludeCommercialProfiles);
    applySetFilter("prioridad",includePriorities,input.excludePrioridades,false);
    applySetFilter("asignadoA",includeAssigned,input.excludeAsignados);
    applySetFilter("assignedUserEmail",includeAssignedUsers,input.excludeAssignedUsers);
    applySetFilter("suscripcion",input.suscripciones,input.excludeSuscripciones);
    applySetFilter("origen",input.origenes,input.excludeOrigenes);
    applySetFilter("quienCargo",input.quienesCargaron,input.excludeQuienesCargaron);
    applySetFilter("medioContactoPreferido",input.mediosContacto,input.excludeMediosContacto);
    applySetFilter("creadoPor",input.creadosPor,input.excludeCreadosPor);

    const textExpressions={
      nombre:sql<string>`lower(coalesce(nombre,''))`,
      contactName:sql<string>`lower(coalesce(contact_name,''))`,
      email:sql<string>`lower(coalesce(email,''))`,
      telefono:sql<string>`lower(coalesce(telefono,''))`,
      sitioWeb:sql<string>`lower(coalesce(sitio_web,''))`,
      urlGmap:sql<string>`lower(coalesce(url_gmap,''))`,
      perfilInstagram:sql<string>`lower(coalesce(perfil_instagram,''))`,
      perfilFacebook:sql<string>`lower(coalesce(perfil_facebook,''))`,
      perfilAirbnb:sql<string>`lower(coalesce(perfil_airbnb,''))`,
      perfilBooking:sql<string>`lower(coalesce(perfil_booking,''))`,
      perfilTurismoEntreRios:sql<string>`lower(coalesce(perfil_turismo_entre_rios,''))`,
      resultadoUltimoContacto:sql<string>`lower(coalesce(resultado_ultimo_contacto,''))`,
      fuenteReferencia:sql<string>`lower(coalesce(fuente_referencia,''))`,
      archivoAdjunto:sql<string>`lower(coalesce(archivo_adjunto,''))`,
    };
    for(const filter of input.textFilters){
      const expr=textExpressions[filter.field];
      const raw=(filter.value??"").trim().toLowerCase();
      if(filter.mode==="contains"&&raw)query=query.where(expr,"like","%"+raw+"%");
      if(filter.mode==="not_contains"&&raw)query=query.where(expr,"not like","%"+raw+"%");
      if(filter.mode==="equals")query=query.where(expr,"=",raw);
      if(filter.mode==="not_equals")query=query.where(expr,"!=",raw);
      if(filter.mode==="empty")query=query.where(expr,"=","");
      if(filter.mode==="not_empty")query=query.where(expr,"!=","");
    }

    for(const filter of input.dateFilters){
      const field=filter.field;
      if(filter.presence==="with")query=query.where(field,"is not",null);
      if(filter.presence==="without")query=query.where(field,"is",null);
      if(filter.presence!=="without"&&filter.from)query=query.where(field,">=",new Date(filter.from+"T00:00:00"));
      if(filter.presence!=="without"&&filter.to)query=query.where(field,"<=",new Date(filter.to+"T23:59:59.999"));
    }
    if(input.idExact?.trim())query=query.where("id","=",input.idExact.trim());
    if(input.idMin?.trim())query=query.where("id",">=",input.idMin.trim());
    if(input.idMax?.trim())query=query.where("id","<=",input.idMax.trim());
    if(input.recurrent==="true")query=query.where("clientePotencialRecurrente","=",true);
    if(input.recurrent==="false")query=query.where("clientePotencialRecurrente","=",false);

    if(input.notesMode){
      const raw=(input.notesText??"").trim().toLowerCase();
      if((input.notesMode==="contains"||input.notesMode==="not_contains"||input.notesMode==="equals"||input.notesMode==="not_equals")&&raw){
        query=query.where(eb=>{
          let sub=eb.selectFrom("leadNotes")
            .select("leadNotes.id")
            .whereRef("leadNotes.leadId","=","leads.id");
          if(input.notesMode==="contains"||input.notesMode==="not_contains")sub=sub.where(sql<string>`lower(note)`,"like","%"+raw+"%");
          else sub=sub.where(sql<string>`lower(note)`,"=",raw);
          return input.notesMode==="not_contains"||input.notesMode==="not_equals"
            ? eb.not(eb.exists(sub))
            : eb.exists(sub);
        });
      }
      if(input.notesMode==="empty")query=query.where(eb=>eb.not(eb.exists(
        eb.selectFrom("leadNotes").select("leadNotes.id").whereRef("leadNotes.leadId","=","leads.id")
      )));
      if(input.notesMode==="not_empty")query=query.where(eb=>eb.exists(
        eb.selectFrom("leadNotes").select("leadNotes.id").whereRef("leadNotes.leadId","=","leads.id")
      ));
    }

    if(input.filterGroups.length){
      query=query.where(eb=>{
        const textExpr=(field:string)=>{
          const map:Record<string,any>={
            nombre:sql<string>`lower(coalesce(nombre,''))`,
            contactName:sql<string>`lower(coalesce(contact_name,''))`,
            email:sql<string>`lower(coalesce(email,''))`,
            telefono:sql<string>`lower(coalesce(telefono,''))`,
            sitioWeb:sql<string>`lower(coalesce(sitio_web,''))`,
            urlGmap:sql<string>`lower(coalesce(url_gmap,''))`,
            perfilInstagram:sql<string>`lower(coalesce(perfil_instagram,''))`,
            perfilFacebook:sql<string>`lower(coalesce(perfil_facebook,''))`,
            perfilAirbnb:sql<string>`lower(coalesce(perfil_airbnb,''))`,
            perfilBooking:sql<string>`lower(coalesce(perfil_booking,''))`,
            perfilTurismoEntreRios:sql<string>`lower(coalesce(perfil_turismo_entre_rios,''))`,
            resultadoUltimoContacto:sql<string>`lower(coalesce(resultado_ultimo_contacto,''))`,
            fuenteReferencia:sql<string>`lower(coalesce(fuente_referencia,''))`,
            archivoAdjunto:sql<string>`lower(coalesce(archivo_adjunto,''))`,
          };
          return map[field];
        };
        const categoryFields=new Set([
          "assignedUserEmail","tipo","subtipo","commercialProfile","ciudad","estado","suscripcion","origen",
          "quienCargo","asignadoA","medioContactoPreferido","prioridad","creadoPor"
        ]);
        const dateFields=new Set(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion","createdAt","updatedAt"]);
        const buildRule=(rule:any):any=>{
          const value=(rule.value??"").trim();
          const value2=(rule.value2??"").trim();
          if(rule.field==="notes"){
            const noteSub=(mode:"like"|"eq")=>{
              let sub=eb.selectFrom("leadNotes").select("leadNotes.id").whereRef("leadNotes.leadId","=","leads.id");
              if(mode==="like")sub=sub.where(sql<string>`lower(note)`,"like","%"+value.toLowerCase()+"%");
              else sub=sub.where(sql<string>`lower(note)`,"=",value.toLowerCase());
              return sub;
            };
            if(rule.operator==="contains"&&value)return eb.exists(noteSub("like"));
            if(rule.operator==="not_contains"&&value)return eb.not(eb.exists(noteSub("like")));
            if(rule.operator==="eq"&&value)return eb.exists(noteSub("eq"));
            if(rule.operator==="neq"&&value)return eb.not(eb.exists(noteSub("eq")));
            const anyNotes=eb.selectFrom("leadNotes").select("leadNotes.id").whereRef("leadNotes.leadId","=","leads.id");
            if(rule.operator==="empty")return eb.not(eb.exists(anyNotes));
            if(rule.operator==="not_empty")return eb.exists(anyNotes);
          }
          if(rule.field==="clientePotencialRecurrente"){
            if(rule.operator==="is_true")return eb("clientePotencialRecurrente","=",true);
            if(rule.operator==="is_false")return eb("clientePotencialRecurrente","=",false);
          }
          if(rule.field==="id"){
            if(rule.operator==="eq"&&value)return eb("id","=",value);
            if(rule.operator==="gte"&&value)return eb("id",">=",value);
            if(rule.operator==="lte"&&value)return eb("id","<=",value);
            if(rule.operator==="between"&&value&&value2)return eb.and([eb("id",">=",value),eb("id","<=",value2)]);
          }
          if(dateFields.has(rule.field)){
            const field=rule.field as any;
            if(rule.operator==="empty")return eb(field,"is",null);
            if(rule.operator==="not_empty")return eb(field,"is not",null);
            if(value){
              const start=new Date(value+"T00:00:00");
              const end=new Date(value+"T23:59:59.999");
              if(rule.operator==="on")return eb.and([eb(field,">=",start),eb(field,"<=",end)]);
              if(rule.operator==="before")return eb(field,"<",start);
              if(rule.operator==="after")return eb(field,">",end);
              if(rule.operator==="between"&&value2){
                return eb.and([eb(field,">=",start),eb(field,"<=",new Date(value2+"T23:59:59.999"))]);
              }
            }
          }
          if(categoryFields.has(rule.field)){
            const field=rule.field as any;
            if(rule.operator==="empty")return eb.or([eb(field,"is",null),eb(field,"=","")]);
            if(rule.operator==="not_empty")return eb.and([eb(field,"is not",null),eb(field,"!=","")]);
            if(rule.operator==="eq")return value==="__EMPTY__"?eb.or([eb(field,"is",null),eb(field,"=","")]):eb(field,"=",value);
            if(rule.operator==="neq")return value==="__EMPTY__"
              ? eb.and([eb(field,"is not",null),eb(field,"!=","")])
              : eb.or([eb(field,"is",null),eb(field,"!=",value)]);
          }
          const expr=textExpr(rule.field);
          if(expr){
            const lower=value.toLowerCase();
            if(rule.operator==="contains"&&value)return eb(expr,"like","%"+lower+"%");
            if(rule.operator==="not_contains"&&value)return eb(expr,"not like","%"+lower+"%");
            if(rule.operator==="eq")return eb(expr,"=",lower);
            if(rule.operator==="neq")return eb(expr,"!=",lower);
            if(rule.operator==="empty")return eb(expr,"=","");
            if(rule.operator==="not_empty")return eb(expr,"!=","");
          }
          return eb(sql<boolean>`true`,"=",true);
        };
        return eb.and(input.filterGroups.map(group=>eb.or(group.rules.map(buildRule))));
      });
    }
    if(input.nextAction==="with") query=query.where("fechaProximaAccion","is not",null);
    if(input.nextAction==="without") query=query.where("fechaProximaAccion","is",null);
    if(input.nextAction==="overdue") query=query.where("fechaProximaAccion","<",new Date());
    const count=await query.select(({fn})=>fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
    const sortBy=input.sortBy??"fechaCreacion";
    const sortDir=input.sortDir??"desc";
    const rows=await query.selectAll().orderBy(sortBy,sortDir).orderBy("id","desc").limit(input.pageSize).offset((input.page-1)*input.pageSize).execute();
    const distinct=async(col:"ciudad"|"estado"|"tipo"|"asignadoA"|"suscripcion"|"origen"|"quienCargo"|"medioContactoPreferido"|"creadoPor")=>(await db.selectFrom("leads").select(col).where("deletedAt","is",null).where(col,"is not",null).distinct().orderBy(col).execute()).map(x=>x[col]).filter((x):x is string=>!!x);
    const [ciudades,estados,tipos,asignados,suscripciones,origenes,quienesCargaron,mediosContacto,creadosPor]=await Promise.all([
      distinct("ciudad"),distinct("estado"),distinct("tipo"),distinct("asignadoA"),distinct("suscripcion"),
      distinct("origen"),distinct("quienCargo"),distinct("medioContactoPreferido"),distinct("creadoPor")
    ]);
    const out={rows,total:Number(count.count),page:input.page,pageSize:input.pageSize,filters:{ciudades,estados,tipos,asignados,suscripciones,origenes,quienesCargaron,mediosContacto,creadosPor}} satisfies OutputType;
    return new Response(superjson.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : "No se pudieron cargar los leads" }), { status: 401 });
  }
}