import {z} from 'zod';
import superjson from 'superjson';
export const searchQuery=z.object({q:z.string().trim().min(2).max(200)});
export type SearchKind='Negocios'|'Gestiones'|'Contactos'|'Notas'|'Pendientes'|'Archivos'|'Mensajes'|'Actividades'|'Modelos de mensajes';
export type SearchResult={id:string;kind:SearchKind;label:string;description:string;url:string};
export async function searchCrm(q:string,signal?:AbortSignal):Promise<{results:SearchResult[]}>{
 const response=await fetch('/_api/search?'+new URLSearchParams({q}),{signal});
 const data=superjson.parse<{results:SearchResult[];error?:string}>(await response.text());
 if(!response.ok)throw new Error(data.error||'No se pudo buscar en el CRM.');
 return data;
}
