import {apiJson} from "../helpers/apiClient";
export type OutputType={total:number;pendientes:number;suscriptos:number;vencidos:number;paraHoy:number;misPendientesHoy:number};
export const getLeadStats=async(entity:"opportunity"|"business"="opportunity"):Promise<OutputType>=>apiJson<OutputType>("/_api/leads_stats?entity="+entity);