import {db} from './db';
import {matchAccounts} from './dataNormalization';
export type DuplicateCandidate={id:string;nombre:string;ciudad:string|null;telefono:string|null;email:string|null;reasons:string[]};
export async function findLeadDuplicates(input:{nombre:string;ciudad?:string|null;telefono?:string|null;email?:string|null}){
 const accounts=await db.selectFrom('crmAccounts').selectAll().where('mergedIntoId','is',null).execute();
 const matches=matchAccounts(input,accounts);
 const leads=matches.length?await db.selectFrom('leads').select(['id','accountId']).where('accountId','in',matches.map(m=>m.id)).where('deletedAt','is',null).orderBy('id').execute():[];
 return matches.map(m=>{const a=accounts.find(a=>String(a.id)===m.id)!;return {id:String(leads.find(l=>String(l.accountId)===m.id)?.id??m.id),nombre:a.nombre,ciudad:a.ciudad,telefono:a.telefono,email:a.email,reasons:[m.kind==='duplicate_candidate'?'Posible duplicado':'Persona compartida / negocio relacionado',...m.reasons]};});
}
