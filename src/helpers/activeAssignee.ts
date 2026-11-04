import type {Kysely,Transaction} from 'kysely';
import type {DB} from './schema';

/** Reject assigning work to an existing account that has been deactivated. */
export async function assertActiveAssignee(executor:Kysely<DB>|Transaction<DB>,{next,previous}:{next:string|null|undefined;previous:string|null|undefined}):Promise<void>{
 if(!next||next===previous)return;
 const user=await executor.selectFrom('users').select(['deactivatedAt']).where('email','=',next).forShare().executeTakeFirst();
 if(user?.deactivatedAt)throw new Error('Elegí un responsable activo. El usuario seleccionado está inactivo.');
}

/** Keep automatic work unassigned when its data-derived owner is inactive. */
export async function activeAssigneeOrNull(executor:Kysely<DB>|Transaction<DB>,email:string|null|undefined):Promise<string|null>{
 if(!email)return null;
 const user=await executor.selectFrom('users').select('deactivatedAt').where('email','=',email).forShare().executeTakeFirst();
 return user&&!user.deactivatedAt?email:null;
}
