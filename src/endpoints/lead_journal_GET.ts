import {globalHistory} from '../helpers/globalHistoryServer';
import {searchSql} from "../helpers/searchSql";
import {CrmForbidden,assertLeadAccess} from '../helpers/crmPermissions';
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./lead_journal_GET.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const url=new URL(request.url);
    const input=schema.parse(Object.fromEntries(url.searchParams));
    if(!input.leadId&&user.role!=="admin"){
      return new Response(superjson.stringify({error:"Solo administradores pueden ver el historial global."}),{status:403});
    }
    if(!input.leadId)return new Response(superjson.stringify(await globalHistory(input)),{headers:{"Content-Type":"application/json"}});
    if(input.leadId)await assertLeadAccess(db,String(input.leadId),user);
    let query=db.selectFrom("leadJournal");
    if(input.leadId)query=query.where("leadId","=",String(input.leadId));
    if(input.action)query=query.where("action","=",input.action);
    if(input.actor)query=query.where("actorName","=",input.actor);
    if(input.city)query=query.where("leadCity","=",input.city);
    if(input.type)query=query.where("leadType","=",input.type);
    if(input.from)query=query.where("createdAt",">=",new Date(input.from+"T00:00:00"));
    if(input.to)query=query.where("createdAt","<=",new Date(input.to+"T23:59:59.999"));
    if(input.q)query=query.where(eb=>eb.or([
      searchSql("leadName",input.q!),
      searchSql("actorName",input.q!),
      searchSql("actorEmail",input.q!),
      searchSql("fieldName",input.q!),
      searchSql("oldValue",input.q!),
      searchSql("newValue",input.q!),
    ]));
    const count=await query.select(({fn})=>fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
    const rows=await query.selectAll().orderBy("createdAt","desc").orderBy("id","desc").limit(input.pageSize).offset((input.page-1)*input.pageSize).execute();
    const filterSource=()=>input.leadId?db.selectFrom("leadJournal").where("leadId","=",String(input.leadId)):db.selectFrom("leadJournal");
    const [actionsRows,actorsRows,citiesRows,typesRows,leadsRows]=await Promise.all([
      filterSource().select("action").distinct().orderBy("action").execute(),
      filterSource().select("actorName").distinct().orderBy("actorName").execute(),
      filterSource().select("leadCity").where("leadCity","is not",null).distinct().orderBy("leadCity").execute(),
      filterSource().select("leadType").where("leadType","is not",null).distinct().orderBy("leadType").execute(),
      filterSource().select(["leadId","leadName"]).where("leadId","is not",null).distinct().orderBy("leadName").execute(),
    ]);
    const out:OutputType={
      rows:rows.map(row=>({...row,id:String(row.id),leadId:row.leadId===null?null:String(row.leadId)})),
      total:Number(count.count),page:input.page,pageSize:input.pageSize,
      filters:{
        actions:actionsRows.map(x=>x.action),
        actors:actorsRows.map(x=>x.actorName),
        cities:citiesRows.map(x=>x.leadCity).filter((x):x is string=>!!x),
        types:typesRows.map(x=>x.leadType).filter((x):x is string=>!!x),
        leads:leadsRows.map(x=>({id:String(x.leadId),name:x.leadName}))
      }
    };
    return new Response(superjson.stringify(out),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo cargar el historial"}),{status:error instanceof CrmForbidden?403:400});
  }
}