import {z} from 'zod';
import {apiJson} from '../helpers/apiClient';
export const searchQuery=z.object({q:z.string().trim().min(2).max(200)});
export type SearchKind='Negocios'|'Gestiones'|'Contactos'|'Notas'|'Pendientes'|'Archivos'|'Material de venta'|'Mensajes'|'Actividades'|'Modelos de mensajes';
export type SearchResult={id:string;kind:SearchKind;label:string;description:string;url:string};
export async function searchCrm(q:string,signal?:AbortSignal):Promise<{results:SearchResult[]}>{
 return apiJson<{results:SearchResult[]}>('/_api/search?'+new URLSearchParams({q}),{signal},{fallback:'No se pudo buscar en el CRM.'});
}
