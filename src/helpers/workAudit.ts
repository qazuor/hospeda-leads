import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';
import type {User} from './User';
/** Transaction-local actor is consumed by audit triggers; never leaks through the pool. */
export async function setWorkActor(trx:Kysely<DB>|Transaction<DB>,user:Pick<User,'email'>){
 await sql`select set_config('crm.actor_email',${user.email},true)`.execute(trx);
}
