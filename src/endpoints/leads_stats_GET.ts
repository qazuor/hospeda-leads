import { businessTableSource } from "../helpers/businessTable";
import { db } from "../helpers/db";
import superjson from "superjson";
import { sql } from "kysely";
import type { OutputType } from "./leads_stats_GET.schema";
import { getServerUserSession } from "../helpers/getServerUserSession";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const business=new URL(request.url).searchParams.get("entity")==="business";
    const count=business?sql.raw("count(distinct account_id)"):sql.raw("count(*)");
    const source=business?db.selectFrom(businessTableSource().as("leads")):db.selectFrom("leads");
    const r=await source.where("deletedAt","is",null).select([
      sql<string>`${count}`.as("total"),
      sql<string>`${count} filter (where coalesce(estado,'') <> 'Suscripto')`.as("pendientes"),
      sql<string>`${count} filter (where estado = 'Suscripto')`.as("suscriptos"),
      sql<string>`${count} filter (where fecha_proxima_accion < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date and coalesce(estado,'') <> 'Suscripto')`.as("vencidos"),
      sql<string>`${count} filter (where fecha_proxima_accion = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date and coalesce(estado,'') <> 'Suscripto')`.as("paraHoy"),
      sql<string>`${count} filter (where assigned_user_email = ${user.email} and fecha_proxima_accion <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date and coalesce(estado,'') <> 'Suscripto')`.as("misPendientesHoy")
    ]).executeTakeFirstOrThrow();
    return new Response(superjson.stringify({
      total:Number(r.total),pendientes:Number(r.pendientes),suscriptos:Number(r.suscriptos),
      vencidos:Number(r.vencidos),paraHoy:Number(r.paraHoy),misPendientesHoy:Number(r.misPendientesHoy)
    } satisfies OutputType));
  }catch(e){
    return new Response(superjson.stringify({error:e instanceof Error?e.message:"No se pudieron cargar métricas"}),{status:401});
  }
}