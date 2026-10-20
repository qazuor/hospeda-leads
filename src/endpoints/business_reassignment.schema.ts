import {apiJson,postJson,LONG_TIMEOUT_MS} from '../helpers/apiClient';
import type {ReassignmentPlan} from '../helpers/businessReassignment';

export type BusinessReassignmentPreview=ReassignmentPlan;
export async function getBusinessReassignmentPreview(){
 const result=await apiJson<BusinessReassignmentPreview>('/_api/business_reassignment',{},{fallback:'No se pudo preparar la vista previa.'});
 if(!result||!Array.isArray(result.users)||!Array.isArray(result.moves))throw new Error('El servidor no devolvió una vista previa válida. Reiniciá el backend y volvé a intentarlo.');
 return result;
}
export async function executeBusinessReassignment(fingerprint:string){
 const result=await postJson<{ok:boolean;moved:number;plan:BusinessReassignmentPreview}>('/_api/business_reassignment',{fingerprint},{fallback:'No se pudo ejecutar la redistribución.',timeoutMs:LONG_TIMEOUT_MS});
 if(!result?.ok)throw new Error('El servidor no confirmó la redistribución. Actualizá la vista previa antes de volver a intentar.');
 return result;
}
