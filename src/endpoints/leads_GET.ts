import {searchSql,normalizeSearchSql,multiFieldSearchSql,phoneSearchSql} from "../helpers/searchSql";
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {calendarDay} from '../helpers/workDates';
import {errorResponse} from "../helpers/errorResponse";
import {localDay,argentinaInstant} from "../helpers/workDates";
import superjson from "superjson";
import type { z } from "zod";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import type { OutputType, AdvancedFilterRule } from "./leads_GET.schema";
import { schema } from "./leads_GET.schema";
import { sql, type Expression, type RawBuilder, type SqlBool } from "kysely";
import { businessTableSource,businessSearchSql } from "../helpers/businessTable";
import {CURRENT_USER_FILTER_VALUE,USER_FILTER_FIELDS,singleRecordIdFilter} from '../helpers/filterRules';
import {managementLabel} from '../helpers/businessManagement';
import {isReviewedBusinessStatus,type BusinessStatus} from '../helpers/businessStatus';
import {groupBy,countBy} from '../helpers/groupBy';

type TextFilterField=z.infer<typeof schema>["textFilters"][number]["field"];
// Normalized SQL expression per text-filterable column; built once and shared by the simple and the advanced filters.
const TEXT_FILTER_EXPRESSIONS:Readonly<Record<TextFilterField,RawBuilder<string>>>={
  nombre:normalizeSearchSql(sql<string>`nombre`),
  contactName:normalizeSearchSql(sql<string>`contact_name`),
  email:normalizeSearchSql(sql<string>`email`),
  telefono:normalizeSearchSql(sql<string>`telefono`),
  contactPhone:normalizeSearchSql(sql<string>`contact_phone`),
  contactEmail:normalizeSearchSql(sql<string>`contact_email`),
  whatsapp:normalizeSearchSql(sql<string>`whatsapp`),
  sitioWeb:normalizeSearchSql(sql<string>`sitio_web`),
  urlGmap:normalizeSearchSql(sql<string>`url_gmap`),
  perfilInstagram:normalizeSearchSql(sql<string>`perfil_instagram`),
  perfilFacebook:normalizeSearchSql(sql<string>`perfil_facebook`),
  perfilAirbnb:normalizeSearchSql(sql<string>`perfil_airbnb`),
  perfilBooking:normalizeSearchSql(sql<string>`perfil_booking`),
  perfilTurismoEntreRios:normalizeSearchSql(sql<string>`perfil_turismo_entre_rios`),
  resultadoUltimoContacto:normalizeSearchSql(sql<string>`resultado_ultimo_contacto`),
  fuenteReferencia:normalizeSearchSql(sql<string>`fuente_referencia`),
  archivoAdjunto:normalizeSearchSql(sql<string>`archivo_adjunto`),
};
// Columns the category filters may target. businessStatus exists only in the business projection, so it is not part of the typed leads columns.
type CategoryColumn=Exclude<CategoryRuleField,"businessStatus">;
type SetFilterColumn=CategoryColumn;
const isTextFilterField=(field:string):field is TextFilterField=>Object.prototype.hasOwnProperty.call(TEXT_FILTER_EXPRESSIONS,field);
type RuleField=AdvancedFilterRule["field"];
type DateRuleField=Extract<RuleField,"fechaCreacion"|"fechaUltimoContacto"|"fechaProximaAccion"|"createdAt"|"updatedAt">;
type CategoryRuleField=Extract<RuleField,"assignedUserEmail"|"managementType"|"tipo"|"subtipo"|"commercialProfile"|"ciudad"|"estado"|"businessStatus"|"suscripcion"|"origen"|"quienCargo"|"asignadoA"|"medioContactoPreferido"|"prioridad"|"creadoPor">;
const CATEGORY_FIELDS:ReadonlySet<string>=new Set<CategoryRuleField>([
  "assignedUserEmail","managementType","tipo","subtipo","commercialProfile","ciudad","estado","businessStatus","suscripcion","origen",
  "quienCargo","asignadoA","medioContactoPreferido","prioridad","creadoPor"
]);
const DATE_FIELDS:ReadonlySet<string>=new Set<DateRuleField>(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion","createdAt","updatedAt"]);
const isCategoryField=(field:string):field is CategoryRuleField=>CATEGORY_FIELDS.has(field);
const isDateField=(field:string):field is DateRuleField=>DATE_FIELDS.has(field);
// Calendar-day columns are stored as UTC midnight; timestamp columns follow the Argentina business day.
const isCalendarDayField=(field:string)=>["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field);
const dayStart=(field:string,day:string)=>isCalendarDayField(field)?new Date(day+"T00:00:00Z"):argentinaInstant(day+"T00:00");
const dayEnd=(field:string,day:string)=>isCalendarDayField(field)?new Date(day+"T23:59:59.999Z"):new Date(argentinaInstant(day+"T23:59").getTime()+59999);

/** Free search (`q=`) over leads columns: the opportunity list predicate (and, over the business projection, the joined reference businessSearchSql must match). */
export const managementSearchSql=(query:string)=>multiFieldSearchSql(["nombre","opportunityName","contactName","email","telefono","ciudad","origen"],query,{phoneColumns:["telefono"],extra:token=>sql<boolean>`exists(select 1 from lead_notes ln where ln.lead_id=leads.id and (${searchSql("ln.note",token)}${phoneSearchSql("ln.note",token)?sql` or ${phoneSearchSql("ln.note",token)}`:sql``}))`});

export async function handle(request: Request) {
  try {
    const {user}=await getServerUserSession(request);
    const url=new URL(request.url); const input=schema.parse(Object.fromEntries(url.searchParams));
    const includeDeleted=input.filterGroups.some(group=>group.rules.some(rule=>rule.field==="deletedAt"));
    if(includeDeleted&&user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden acceder a registros eliminados."}),{status:403});
    // The management type is a column of each management; the business projection has no single value for it.
    if(input.entity==="business"&&input.filterGroups.some(group=>group.rules.some(rule=>rule.field==="managementType")))return new Response(superjson.stringify({error:"El tipo de gestión solo se filtra en Gestiones."}),{status:400});
    const source=()=>input.entity==="business" ? db.selectFrom(businessTableSource(includeDeleted).as("leads")) : db.selectFrom("leads");
    let query=source();
    if(!includeDeleted)query=query.where("deletedAt","is",null);
    if(input.entity==="opportunity")query=query.where("accountId","in",db.selectFrom("crmAccounts").select("id").where("deletedAt","is",null));
    // Decision 1C: a single-management lookup (the /sales/:id detail) also returns a management of an archived business to that business's responsible seller, read-only (canModify stays false). Lists keep hiding archived businesses from sellers.
    const detailLookup=input.entity==="opportunity"&&singleRecordIdFilter(input.filterGroups)!==null;
    if(input.entity==="opportunity"&&user.role!=="admin")query=query.where(eb=>eb.exists(eb.selectFrom("crmAccounts").select("id").whereRef("crmAccounts.id","=","leads.accountId").where(a=>detailLookup?a.or([a("archivedAt","is",null),a("assignedUserEmail","=",user.email)]):a("archivedAt","is",null))));
    // Business rows join several tables: match per-table id sets so each table's trigram index applies (same matches as the joined predicate).
    if(input.q&&input.entity==="business")query=query.where(businessSearchSql(input.q));
    else if(input.q)query=query.where(managementSearchSql(input.q));

    const includeCities=input.ciudades.length?input.ciudades:(input.ciudad?[input.ciudad]:[]);
    const includeStates=input.estados.length?input.estados:(input.estado?[input.estado]:[]);
    const includeTypes=input.tipos.length?input.tipos:(input.tipo?[input.tipo]:[]);
    const includeSubtypes=input.subtipos.length?input.subtipos:(input.subtipo?[input.subtipo]:[]);
    const includeProfiles=input.commercialProfiles.length?input.commercialProfiles:(input.commercialProfile?[input.commercialProfile]:[]);
    const includePriorities=input.prioridades.length?input.prioridades:(input.prioridad?[input.prioridad]:[]);
    const includeAssigned=input.asignados.length?input.asignados:(input.asignado?[input.asignado]:[]);
    const includeAssignedUsers=input.assignedUsers.length?input.assignedUsers:(input.assignedUser?[input.assignedUser]:[]);

    const applySetFilter=(column:SetFilterColumn,include:string[],exclude:string[],allowBlank=true)=>{
      const includeEmpty=include.includes("__EMPTY__");
      const includeValues=include.filter(x=>x!=="__EMPTY__");
      if(includeValues.length||includeEmpty)query=query.where(eb=>eb.or([
        ...(includeValues.length?[eb(column,"in",includeValues)]:[]),
        ...(includeEmpty?[eb(column,"is",null)]:[]),
        ...(includeEmpty&&allowBlank?[eb(column,"=","")]:[])
      ]));
      const excludeEmpty=exclude.includes("__EMPTY__");
      const excludeValues=exclude.filter(x=>x!=="__EMPTY__");
      if(excludeValues.length)query=query.where(eb=>eb.or([eb(column,"is",null),eb(column,"not in",excludeValues)]));
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

    for(const filter of input.textFilters){
      const expr=TEXT_FILTER_EXPRESSIONS[filter.field];
      const value=(filter.value??"").trim();
      const raw=normalizeSearchSql(sql<string>`${value}`);
      if(filter.mode==="contains"&&value)query=query.where(expr,"like",normalizeSearchSql(sql<string>`${"%"+value+"%"}`));
      if(filter.mode==="not_contains"&&value)query=query.where(expr,"not like",normalizeSearchSql(sql<string>`${"%"+value+"%"}`));
      if(filter.mode==="equals")query=query.where(expr,"=",raw);
      if(filter.mode==="not_equals")query=query.where(expr,"!=",raw);
      if(filter.mode==="empty")query=query.where(expr,"=","");
      if(filter.mode==="not_empty")query=query.where(expr,"!=","");
    }

    for(const filter of input.dateFilters){
      const field=filter.field;
      if(filter.presence==="with")query=query.where(field,"is not",null);
      if(filter.presence==="without")query=query.where(field,"is",null);
      if(filter.presence!=="without"&&filter.from)query=query.where(field,">=",dayStart(field,filter.from));
      if(filter.presence!=="without"&&filter.to)query=query.where(field,"<=",dayEnd(field,filter.to));
    }
    if(input.idExact?.trim())query=query.where("id","=",input.idExact.trim());
    if(input.idMin?.trim())query=query.where("id",">=",input.idMin.trim());
    if(input.idMax?.trim())query=query.where("id","<=",input.idMax.trim());
    if(input.recurrent==="true")query=query.where("clientePotencialRecurrente","=",true);
    if(input.recurrent==="false")query=query.where("clientePotencialRecurrente","=",false);

    if(input.notesMode){
      const raw=(input.notesText??"").trim();
      if((input.notesMode==="contains"||input.notesMode==="not_contains"||input.notesMode==="equals"||input.notesMode==="not_equals")&&raw){
        query=query.where(eb=>{
          let sub=eb.selectFrom("leadNotes")
            .select("leadNotes.id")
            .whereRef("leadNotes.leadId","=","leads.id");
          if(input.notesMode==="contains"||input.notesMode==="not_contains")sub=sub.where(normalizeSearchSql(sql<string>`note`),"like",normalizeSearchSql(sql<string>`${"%"+raw+"%"}`));
          else sub=sub.where(normalizeSearchSql(sql<string>`note`),"=",normalizeSearchSql(sql<string>`${raw}`));
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
        const buildRule=(rule:AdvancedFilterRule):Expression<SqlBool>=>{
          if(rule.field==="deletedAt")return eb("deletedAt",rule.operator==="is_true"?"is not":"is",null);
          const value=(rule.value??"").trim();
          const value2=(rule.value2??"").trim();
          if(rule.field==="notes"){
            const noteSub=(mode:"like"|"eq")=>{
              let sub=eb.selectFrom("leadNotes").select("leadNotes.id").whereRef("leadNotes.leadId","=","leads.id");
              if(mode==="like")sub=sub.where(normalizeSearchSql(sql<string>`note`),"like",normalizeSearchSql(sql<string>`${"%"+value+"%"}`));
              else sub=sub.where(normalizeSearchSql(sql<string>`note`),"=",normalizeSearchSql(sql<string>`${value}`));
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
          if(rule.field==="reviewStatus"){
            const account=()=>eb.selectFrom("crmAccounts").select("id").whereRef("crmAccounts.id","=","leads.accountId");
            if(rule.operator==="is_true")return eb.exists(account().where("status","is not",null).where("status","!=","new"));
            if(rule.operator==="is_false")return eb.exists(account().where(status=>status.or([status("status","is",null),status("status","=","new")])));
          }
          if(rule.field==="businessStatus"){
            const account=()=>eb.selectFrom('crmAccounts').select('id').whereRef('crmAccounts.id','=','leads.accountId');
            if(rule.operator==='empty')return eb.not(eb.exists(account().where('status','is not',null)));
            if(rule.operator==='not_empty')return eb.exists(account().where('status','is not',null));
            if(value&&(rule.operator==='eq'||rule.operator==='neq')){
              const matches=eb.exists(account().where('status','=',value as BusinessStatus));
              return rule.operator==='eq'?matches:eb.not(matches);
            }
          }
          if(rule.field==="id"){
            if(rule.operator==="eq"&&value)return eb("id","=",value);
            if(rule.operator==="gte"&&value)return eb("id",">=",value);
            if(rule.operator==="lte"&&value)return eb("id","<=",value);
            if(rule.operator==="between"&&value&&value2)return eb.and([eb("id",">=",value),eb("id","<=",value2)]);
          }
          if(isDateField(rule.field)){
            const field=rule.field;
            if(rule.operator==="empty")return eb(field,"is",null);
            if(rule.operator==="not_empty")return eb(field,"is not",null);
            if(value){
              const start=dayStart(field,value);
              const end=dayEnd(field,value);
              if(rule.operator==="on")return eb.and([eb(field,">=",start),eb(field,"<=",end)]);
              if(rule.operator==="before")return eb(field,"<",start);
              if(rule.operator==="after")return eb(field,">",end);
              if(rule.operator==="between"&&value2){
                return eb.and([eb(field,">=",start),eb(field,"<=",dayEnd(field,value2))]);
              }
            }
          }
          if(isCategoryField(rule.field)){
            // businessStatus only reaches here from the business projection, which does project business_status.
            const field=rule.field as CategoryColumn;
            const userValues=USER_FILTER_FIELDS.has(rule.field)&&value===CURRENT_USER_FILTER_VALUE?[user.email,user.displayName].filter((item,index,all):item is string=>!!item&&all.indexOf(item)===index):null;
            if(rule.operator==="empty")return eb.or([eb(field,"is",null),eb(field,"=","")]);
            if(rule.operator==="not_empty")return eb.and([eb(field,"is not",null),eb(field,"!=","")]);
            if(rule.operator==="eq")return userValues?eb(field,"in",userValues):value==="__EMPTY__"?eb.or([eb(field,"is",null),eb(field,"=","")]):eb(field,"=",value);
            if(rule.operator==="neq")return value==="__EMPTY__"
              ? eb.and([eb(field,"is not",null),eb(field,"!=","")])
              : userValues?eb.or([eb(field,"is",null),eb.and(userValues.map(userValue=>eb(field,"!=",userValue)))])
              : eb.or([eb(field,"is",null),eb(field,"!=",value)]);
          }
          const expr=isTextFilterField(rule.field)?TEXT_FILTER_EXPRESSIONS[rule.field]:undefined;
          if(expr){
            const normalized=normalizeSearchSql(sql<string>`${value}`);
            if(rule.operator==="contains"&&value)return eb(expr,"like",normalizeSearchSql(sql<string>`${"%"+value+"%"}`));
            if(rule.operator==="not_contains"&&value)return eb(expr,"not like",normalizeSearchSql(sql<string>`${"%"+value+"%"}`));
            if(rule.operator==="eq")return eb(expr,"=",normalized);
            if(rule.operator==="neq")return eb(expr,"!=",normalized);
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
    // Opportunity board: the total comes from the grouped board query, so the separate count is skipped.
    const boardMode=input.view==="board"&&input.entity==="opportunity";
    const count=boardMode?null:await query.select(({fn})=>(input.entity==="business"?fn.count<string>("accountId").distinct():fn.countAll<string>()).as("count")).executeTakeFirstOrThrow();
    const sortBy=input.sortBy??"fechaCreacion";
    const sortDir=input.sortDir??"desc";
    const candidates=input.entity==="business"
      ? db.selectFrom(query.selectAll().distinctOn("accountId").orderBy("accountId").orderBy("id","asc").as("leads"))
      : query;
    const orderExpression=sortBy==='businessStatus'?(input.entity==='business'?sql.ref('business_status'):sql<string>`(SELECT status FROM crm_accounts WHERE id=leads.account_id)`):sortBy==='reviewStatus'?sql<boolean>`coalesce((SELECT status FROM crm_accounts WHERE id=leads.account_id),'new') <> 'new'`:sql.ref(sortBy);
    let anchorPage:number|undefined;
    if(input.entity==='business'&&input.anchorAccountId){
      const ranked=candidates.select('accountId').select(sql<number>`row_number() over(order by ${orderExpression} ${sql.raw(sortDir)}, id desc)`.as('rowPosition')).as('ranked');
      const anchor=await db.selectFrom(ranked).select('rowPosition').where('accountId','=',input.anchorAccountId).executeTakeFirst();
      if(anchor)anchorPage=Math.ceil(Number(anchor.rowPosition)/input.pageSize);
    }
    const page=input.alignAnchorPage&&anchorPage?anchorPage:input.page;
    const rowsQuery=candidates.selectAll().orderBy(orderExpression,sortDir).orderBy("id","desc").$if(input.view==="board",q=>q.limit(500)).$if(input.view!=="board",q=>q.limit(input.pageSize).offset((page-1)*input.pageSize));
    // Board only: real totals under the same filters (the board itself is capped at 500 rows), grouped by stage and management type so the client can reduce them for any view.
    const groupedTotals=boardMode?query.select(sql<string>`coalesce((select classification from crm_stages where name=leads.estado),'open')`.as("classification")).select(["estado","managementType"]).select(({fn})=>fn.countAll<string>().as("count")).groupBy([sql`1`,"estado","managementType"]).execute():Promise.resolve(null);
    const [loadedRows,grouped]=await Promise.all([rowsQuery.execute(),groupedTotals]);
    const rows:OutputType["rows"]=loadedRows;
    if(rows.length){
      const permissions=await db.selectFrom("crmAccounts").select(["id","assignedUserEmail","archivedAt","deletedAt","mergedIntoId","doNotContact"]).where("id","in",[...new Set(rows.map(r=>String(r.accountId)))]).execute();
      const permissionsById=new Map(permissions.map(a=>[String(a.id),a]));
      for(const row of rows){row.canModify=!row.deletedAt&&(input.entity==="business"?canModifyBusiness(user,permissionsById.get(String(row.accountId))):canModifyManagement(user,row,permissionsById.get(String(row.accountId))));if(input.entity==="opportunity")row.accountArchived=!!permissionsById.get(String(row.accountId))?.archivedAt;}
    }
    if(input.entity==="business"&&rows.length){
      const ids=rows.map(row=>String(row.accountId));
      const [accounts,opportunities,contacts,nextTasks]=await Promise.all([
        db.selectFrom("crmAccounts").select(["id","commercialStatus","tipo","subtipo","status","recontactAt","isClient","referredToLeandro","doNotContact"]).where("id","in",ids).execute(),
        db.selectFrom("leads").selectAll().where("accountId","in",ids).where("deletedAt","is",null).orderBy("id").execute(),
        db.selectFrom("crmContacts").select(["accountId"]).where("accountId","in",ids).where("deletedAt","is",null).execute(),
        db.selectFrom("crmTasks as t").leftJoin("leads as l","l.id","t.leadId").select(["t.accountId","t.title","t.dueDate"]).where("t.accountId","in",ids).where("t.status","=","pending").where("t.deletedAt","is",null).where(eb=>eb.or([eb("t.leadId","is",null),eb("l.deletedAt","is",null)])).$if(user.role!=="admin",q=>q.where("t.assignedUserEmail","=",user.email)).orderBy("t.dueDate").orderBy("t.dueAt").orderBy("t.id").execute()
      ]);
      // Index related rows once per request: the loop stays O(rows + related) even for the unpaginated board.
      const accountsById=new Map(accounts.map(a=>[String(a.id),a]));
      const opportunitiesByAccount=groupBy(opportunities,o=>String(o.accountId));
      const contactCountByAccount=countBy(contacts,c=>String(c.accountId));
      const nextTasksByAccount=groupBy(nextTasks,t=>String(t.accountId));
      for(const row of rows){
        const accountKey=String(row.accountId);
        const related=row.deletedAt?[]:opportunitiesByAccount.get(accountKey)??[];
        row.opportunityId=Number(row.id)>0?String(row.id):null;
        // Stable business IDs keep row selection stable when filters match another sale.
        row.id=row.accountId;
        row.nextActionTitle=nextTasksByAccount.get(accountKey)?.find(t=>calendarDay(t.dueDate)===calendarDay(row.fechaProximaAccion))?.title??null;
        row.opportunityCount=related.length;
        row.canModifyManagement=related.some(item=>user.role==='admin'||(item.assignedUserEmail===user.email&&!accountsById.get(accountKey)?.doNotContact));
        row.contactCount=contactCountByAccount.get(accountKey)??0;
        const account=accountsById.get(accountKey)!;
        row.commercialStatus=account.commercialStatus;
        row.businessStatus=account.status;
        row.reviewStatus=isReviewedBusinessStatus(account.status);
        row.businessRecontactAt=account.recontactAt?calendarDay(account.recontactAt):null;
        row.isClient=account.isClient;
        row.doNotContact=account.doNotContact;
        row.referredToLeandro=account.referredToLeandro;
        row.opportunityValues=Object.fromEntries(["tipo","subtipo","commercialProfile","estado","suscripcion","prioridad","quienCargo","medioContactoPreferido","fechaCreacion","fechaUltimoContacto","fechaProximaAccion","resultadoUltimoContacto","contactName","origen","fuenteReferencia","clientePotencialRecurrente","archivoAdjunto","creadoPor"].map(field=>[field,[...new Set(related.map(o=>{const v=o[field as keyof typeof o];return field==='estado'&&o.managementType?managementLabel(o.managementType,String(v)):v instanceof Date?v.toISOString():v==null?"":String(v)}).filter(Boolean))]]));
        for(const f of ['tipo','subtipo'] as const)row.opportunityValues[f]=account[f]?[account[f]!]:[];
      }
    }
    const distinct=async(col:"ciudad"|"estado"|"tipo"|"asignadoA"|"suscripcion"|"origen"|"quienCargo"|"medioContactoPreferido"|"creadoPor")=>(await source().select(col).$if(!includeDeleted,q=>q.where("deletedAt","is",null)).where(col,"is not",null).distinct().orderBy(col).execute()).map(x=>x[col]).filter((x):x is string=>!!x);
    const [ciudades,estados,tipos,asignados,suscripciones,origenes,quienesCargaron,mediosContacto,creadosPor,businessStatuses]=input.filterOptions==="include"?await Promise.all([
      distinct("ciudad"),distinct("estado"),distinct("tipo"),distinct("asignadoA"),distinct("suscripcion"),
      distinct("origen"),distinct("quienCargo"),distinct("medioContactoPreferido"),distinct("creadoPor"),
      db.selectFrom('crmAccounts').select('status').distinct().where('status','is not',null).orderBy('status').execute().then(rows=>rows.map(row=>row.status))
    ]):[[],[],[],[],[],[],[],[],[],[]];
    const boardTotals=grouped?(()=>{
      const totals={open:0,won:0,lost:0,total:0,groups:grouped.map(item=>({estado:item.estado??null,managementType:item.managementType??null,count:Number(item.count)}))};
      for(const item of grouped){const key=item.classification==="won"||item.classification==="lost"?item.classification:"open";totals[key]+=Number(item.count);totals.total+=Number(item.count)}
      return totals;
    })():undefined;
    const out={rows,total:boardTotals?boardTotals.total:Number(count!.count),page,pageSize:input.pageSize,...(boardTotals?{boardTotals,truncated:boardTotals.total>rows.length}:{}),...(anchorPage?{anchorPage}:{}),filters:{ciudades,estados,tipos,businessStatuses,asignados,suscripciones,origenes,quienesCargaron,mediosContacto,creadosPor}} satisfies OutputType;
    return new Response(superjson.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return errorResponse(error);
  }
}
