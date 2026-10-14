import superjson from 'superjson';
import type {ReassignmentPlan} from '../helpers/businessReassignment';

export type BusinessReassignmentPreview=ReassignmentPlan;
async function readResult<T>(response:Response):Promise<T&{error?:string}>{
 const text=await response.text();
 let result:T&{error?:string}|undefined;
 try{result=superjson.parse<T&{error?:string}>(text)}catch{}
 if(result===undefined){
  try{result=JSON.parse(text) as T&{error?:string}}catch{throw new Error('El servidor devolvió una respuesta que no se pudo interpretar.')}
 }
 return result;
}

export async function getBusinessReassignmentPreview(){
 const response=await fetch('/_api/business_reassignment');
 const result=await readResult<BusinessReassignmentPreview>(response);
 if(!response.ok)throw new Error(result.error||'No se pudo preparar la vista previa.');
 if(!result||!Array.isArray(result.users)||!Array.isArray(result.moves))throw new Error('El servidor no devolvió una vista previa válida. Reiniciá el backend y volvé a intentarlo.');
 return result;
}
export async function executeBusinessReassignment(fingerprint:string){
 const response=await fetch('/_api/business_reassignment',{method:'POST',headers:{'Content-Type':'application/json'},body:superjson.stringify({fingerprint})});
 const result=await readResult<{ok:boolean;moved:number;plan:BusinessReassignmentPreview}>(response);
 if(!response.ok)throw new Error(result.error||'No se pudo ejecutar la redistribución.');
 if(!result?.ok)throw new Error('El servidor no confirmó la redistribución. Actualizá la vista previa antes de volver a intentar.');
 return result;
}
