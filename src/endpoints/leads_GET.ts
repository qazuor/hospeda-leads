import {searchSql} from "../helpers/searchSql";
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {calendarDay} from '../helpers/workDates';
import {crmError} from '../helpers/crmErrors';
import {localDay,argentinaInstant} from "../helpers/workDates";
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType } from "./leads_GET.schema";
import { schema } from "./leads_GET.schema";
import { sql } from "kysely";
import { businessTableSource } from "../helpers/businessTable";

export async function handle(request: Request) {
  try {
    const {user}=await getServerUserSession(request);
    const url=new URL(request.url); const input=schema.parse(Object.fromEntries(url.searchParams));
    const includeDeleted=input.filterGroups.some(group=>group.rules.some(rule=>rule.field==="deletedAt"));
    if(includeDeleted&&user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden acceder a registros eliminados."}),{status:403});
    const source=()=>input.entity==="business" ? db.selectFrom(businessTableSource(includeDeleted).as("leads")) : db.selectFrom("leads");
    let query=source();
    if(!includeDeleted)query=query.where("deletedAt","is",null);
    if(input.entity==="opportunity"&&user.role!=="admin")query=query.where(eb=>eb.exists(eb.selectFrom("crmAccounts").select("id").whereRef("crmAccounts.id","=","leads.accountId").where("archivedAt","is",null)));
    if(input.q)query=query.where(eb=>eb.or([
      searchSql("nombre",input.q!),
      searchSql("opportunityName",input.q!),
      searchSql("contactName",input.q!),
      searchSql("email",input.q!),
      searchSql("telefono",input.q!),
      searchSql("ciudad",input.q!),
      searchSql("origen",input.q!),
      eb.exists(eb.selectFrom("leadNotes").select("leadNotes.id")
        .whereRef("leadNotes.leadId","=","leads.id")
        .where(searchSql("note",input.q!)))
    ]));
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
      if(filter.presence!=="without"&&filter.from)query=query.where(field,">=",(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field)?new Date(filter.from+"T00:00:00Z"):argentinaInstant(filter.from+"T00:00")));
      if(filter.presence!=="without"&&filter.to)query=query.where(field,"<=",(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field)?new Date(filter.to+"T23:59:59.999Z"):new Date(argentinaInstant(filter.to+"T23:59").getTime()+59999)));
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
          if(rule.field==="deletedAt")return eb("deletedAt",rule.operator==="is_true"?"is not":"is",null);
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
              const start=(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field)?new Date(value+"T00:00:00Z"):argentinaInstant(value+"T00:00"));
              const end=(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field)?new Date(value+"T23:59:59.999Z"):new Date(argentinaInstant(value+"T23:59").getTime()+59999));
              if(rule.operator==="on")return eb.and([eb(field,">=",start),eb(field,"<=",end)]);
              if(rule.operator==="before")return eb(field,"<",start);
              if(rule.operator==="after")return eb(field,">",end);
              if(rule.operator==="between"&&value2){
                return eb.and([eb(field,">=",start),eb(field,"<=",(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field)?new Date(value2+"T23:59:59.999Z"):new Date(argentinaInstant(value2+"T23:59").getTime()+59999)))]);
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
    if(input.contactPresence){
      const contacted=sql<boolean>`(fecha_ultimo_contacto IS NOT NULL OR EXISTS (SELECT 1 FROM crm_activities ac WHERE ac.deleted_at IS NULL AND (ac.lead_id=leads.id OR (ac.lead_id IS NULL AND ac.account_id=leads.account_id))))`;
      query=query.where(contacted,'=',input.contactPresence==='contacted');
    }
    if(input.inactiveDays)query=query.where(sql<Date>`greatest(coalesce(fecha_ultimo_contacto,created_at),coalesce((select max(occurred_at) from crm_activities ac where (ac.lead_id=leads.id or (ac.lead_id is null and ac.account_id=leads.account_id)) and ac.deleted_at is null),created_at))`,'<',new Date(Date.now()-input.inactiveDays*86400000));
    if(input.nextAction==="with") query=query.where("fechaProximaAccion","is not",null);
    if(input.nextAction==="without") query=query.where("fechaProximaAccion","is",null);
    if(input.nextAction==="overdue") query=query.where("fechaProximaAccion","<",new Date(localDay()+"T00:00:00Z"));
    if(input.classification)query=query.where(sql<string>`coalesce((select classification from crm_stages where name=leads.estado),'open')`,'=',input.classification);
    if(input.commercialStatus)query=query.where('accountId','in',db.selectFrom('crmAccounts').select('id').where('commercialStatus','=',input.commercialStatus));
    const count=await query.select(({fn})=>(input.entity==="business"?fn.count<string>("accountId").distinct():fn.countAll<string>()).as("count")).executeTakeFirstOrThrow();
    const sortBy=input.sortBy??"fechaCreacion";
    const sortDir=input.sortDir??"desc";
    const candidates=input.entity==="business"
      ? db.selectFrom(query.selectAll().distinctOn("accountId").orderBy("accountId").orderBy("id","asc").as("leads"))
      : query;
    let anchorPage:number|undefined;
    if(input.entity==='business'&&input.anchorAccountId){
      const ranked=candidates.select('accountId').select(sql<number>`row_number() over(order by ${sql.ref(sortBy)} ${sql.raw(sortDir)}, id desc)`.as('rowPosition')).as('ranked');
      const anchor=await db.selectFrom(ranked).select('rowPosition').where('accountId','=',input.anchorAccountId).executeTakeFirst();
      if(anchor)anchorPage=Math.ceil(Number(anchor.rowPosition)/input.pageSize);
    }
    const page=input.alignAnchorPage&&anchorPage?anchorPage:input.page;
    const rows:OutputType["rows"]=await candidates.selectAll().orderBy(sortBy,sortDir).orderBy("id","desc").$if(input.view!=="board",q=>q.limit(input.pageSize).offset((page-1)*input.pageSize)).execute();
    if(rows.length){
      const permissions=await db.selectFrom("crmAccounts").select(["id","assignedUserEmail","archivedAt","mergedIntoId"]).where("id","in",[...new Set(rows.map(r=>String(r.accountId)))]).execute();
      for(const row of rows)row.canModify=!row.deletedAt&&(input.entity==="business"?canModifyBusiness(user,permissions.find(a=>String(a.id)===String(row.accountId))):canModifyManagement(user,row,permissions.find(a=>String(a.id)===String(row.accountId))));
    }
    if(input.entity==="business"&&rows.length){
      const ids=rows.map(row=>String(row.accountId));
      const [accounts,opportunities,contacts,nextTasks]=await Promise.all([
        db.selectFrom("crmAccounts").select(["id","commercialStatus","tipo","subtipo"]).where("id","in",ids).execute(),
        db.selectFrom("leads").selectAll().where("accountId","in",ids).where("deletedAt","is",null).orderBy("id").execute(),
        db.selectFrom("crmContacts").select(["accountId"]).where("accountId","in",ids).where("deletedAt","is",null).execute(),
        db.selectFrom("crmTasks as t").leftJoin("leads as l","l.id","t.leadId").select(["t.accountId","t.title","t.dueDate"]).where("t.accountId","in",ids).where("t.status","=","pending").where("t.deletedAt","is",null).where(eb=>eb.or([eb("t.leadId","is",null),eb("l.deletedAt","is",null)])).$if(user.role!=="admin",q=>q.where("t.assignedUserEmail","=",user.email)).orderBy("t.dueDate").orderBy("t.dueAt").orderBy("t.id").execute()
      ]);
      for(const row of rows){
        const related=row.deletedAt?[]:opportunities.filter(o=>String(o.accountId)===String(row.accountId));
        row.opportunityId=Number(row.id)>0?String(row.id):null;
        // Stable business IDs keep row selection stable when filters match another sale.
        row.id=row.accountId;
        row.nextActionTitle=nextTasks.find(t=>String(t.accountId)===String(row.accountId)&&calendarDay(t.dueDate)===calendarDay(row.fechaProximaAccion))?.title??null;
        row.opportunityCount=related.length;
        row.canModifyManagement=related.some(item=>user.role==='admin'||item.assignedUserEmail===user.email);
        row.contactCount=contacts.filter(c=>String(c.accountId)===String(row.accountId)).length;
        row.commercialStatus=accounts.find(a=>String(a.id)===String(row.accountId))!.commercialStatus;
        const account=accounts.find(a=>String(a.id)===String(row.accountId))!;
        row.opportunityValues=Object.fromEntries(["tipo","subtipo","commercialProfile","estado","suscripcion","prioridad","quienCargo","medioContactoPreferido","fechaCreacion","fechaUltimoContacto","fechaProximaAccion","resultadoUltimoContacto","contactName","origen","fuenteReferencia","clientePotencialRecurrente","archivoAdjunto","creadoPor"].map(field=>[field,[...new Set(related.map(o=>{const v=o[field as keyof typeof o];return v instanceof Date?v.toISOString():v==null?"":String(v)}).filter(Boolean))]]));
        for(const f of ['tipo','subtipo'] as const)row.opportunityValues[f]=account[f]?[account[f]!]:[];
      }
    }
    const distinct=async(col:"ciudad"|"estado"|"tipo"|"asignadoA"|"suscripcion"|"origen"|"quienCargo"|"medioContactoPreferido"|"creadoPor")=>(await source().select(col).$if(!includeDeleted,q=>q.where("deletedAt","is",null)).where(col,"is not",null).distinct().orderBy(col).execute()).map(x=>x[col]).filter((x):x is string=>!!x);
    const [ciudades,estados,tipos,asignados,suscripciones,origenes,quienesCargaron,mediosContacto,creadosPor]=await Promise.all([
      distinct("ciudad"),distinct("estado"),distinct("tipo"),distinct("asignadoA"),distinct("suscripcion"),
      distinct("origen"),distinct("quienCargo"),distinct("medioContactoPreferido"),distinct("creadoPor")
    ]);
    const out={rows,total:Number(count.count),page,pageSize:input.pageSize,...(anchorPage?{anchorPage}:{}),filters:{ciudades,estados,tipos,asignados,suscripciones,origenes,quienesCargaron,mediosContacto,creadosPor}} satisfies OutputType;
    return new Response(superjson.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(superjson.stringify({ error: crmError(error) }), { status: 401 });
  }
}