import {ZodError} from 'zod';
const labels:Record<string,string>={nombre:'el nombre del negocio',name:'el nombre',title:'qué hay que hacer',reason:'el motivo',dueDate:'la fecha',resumeDate:'la fecha para retomar',occurredAt:'la fecha y hora real',completedAt:'la fecha y hora real',estimatedCloseDate:'la fecha prevista de cierre',opportunityName:'el nombre de la gestión',typeId:'el tipo de acción',stage:'la etapa',reasonId:'el motivo de pérdida',contactId:'la persona de contacto',email:'el email',subject:'el asunto',body:'el mensaje',result:'el resultado',outcome:'qué pasó',accountId:'el negocio',leadId:'la gestión',channel:'el canal'};
export function crmError(error:unknown):string{
 if(error instanceof ZodError){const issue=error.issues[0];const field=labels[String(issue.path.at(-1))]||'los datos del formulario';if(issue.code==='too_small'&&issue.type==='string')return `Completá ${field}${issue.minimum>1?` con al menos ${issue.minimum} caracteres`:''}.`;if(issue.code==='too_big')return `El valor de ${field} es demasiado largo. Acortalo para guardar.`;if(issue.code==='custom'&&!issue.message.startsWith('Invalid'))return issue.message;return `Revisá ${field} y elegí un valor válido.`}
 const generic='No se pudo completar la acción. Intentá de nuevo.';
 if(!(error instanceof Error))return generic;
 const friendly=friendlySqlState(error);
 if(friendly){if(['23503','23514','22P02','22001','22007','22008'].includes(sqlState(error)!))logOnce(error);return friendly}
 if(isUnexpectedError(error)){logOnce(error);return generic}
 return error.message;
}
const sqlStateMessages:Record<string,string>={'22P02':'Alguno de los datos tiene un formato inválido.','22001':'Alguno de los textos es demasiado largo.','22007':'Alguna de las fechas no es válida.','22008':'Alguna de las fechas no es válida.','23503':'El elemento que elegiste ya no existe o cambió. Recargá e intentá de nuevo.','23514':'Alguno de los datos no es válido. Revisalos e intentá de nuevo.','23505':'Ya existe un registro con esos datos.','40001':'Hubo un conflicto con otro cambio. Intentá de nuevo.','40P01':'Hubo un conflicto con otro cambio. Intentá de nuevo.','55P03':'La operación tardó demasiado. Intentá de nuevo.','57014':'La operación tardó demasiado. Intentá de nuevo.'};
const logged=new WeakSet<object>();
const logOnce=(error:Error)=>{if(logged.has(error))return;logged.add(error);console.error('[crm] unexpected error',error)};
/** Duck-typed postgres.js error (PostgresError has a 5-char SQLSTATE `code` and a `severity`); avoids importing the driver into the client bundle. */
const sqlState=(error:unknown):string|null=>{const e=error as {code?:unknown;severity?:unknown};return typeof e?.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code)&&e.severity!==undefined?e.code:null};
/** Errors raised on purpose by our own triggers (RAISE EXCEPTION, default P0001, or the 23502 guard without table/column info) carry a user-facing Spanish message. */
const isDeliberateTriggerError=(error:unknown)=>{const code=sqlState(error);if(code==='P0001')return true;const e=error as {table_name?:unknown;column_name?:unknown};return code==='23502'&&!e.table_name&&!e.column_name};
const friendlySqlState=(error:unknown)=>{const code=sqlState(error);return code?sqlStateMessages[code]??null:null};
/** True for driver/SQL/programming errors whose message must never reach users (trigger-raised business messages and ZodError are not unexpected). */
export function isUnexpectedError(error:unknown):boolean{
 if(error instanceof ZodError)return false;
 if(sqlState(error))return !isDeliberateTriggerError(error);
 return error instanceof TypeError||error instanceof RangeError||error instanceof SyntaxError;
}
/** Fallback HTTP status for errors that are not auth/forbidden/conflict: 500 for unexpected errors (SQL/programming), 400 otherwise (validation, business rules, trigger messages, friendly SQL states such as duplicates). */
export function fallbackStatus(error:unknown):400|500{return isUnexpectedError(error)&&!friendlySqlState(error)?500:400}
