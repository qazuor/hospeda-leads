import type {Kysely} from 'kysely';
import type {DB} from './schema';

export async function classificationErrors(database:Kysely<DB>,tipo:string|null,subtipo:string|null,previous?:{tipo:string|null;subtipo:string|null}){
 const errors:string[]=[];
 if(previous&&tipo===previous.tipo&&subtipo===previous.subtipo)return errors;
 if(tipo&&!await database.selectFrom('crmVerticals').select('id').where('name','=',tipo).where('active','=',true).executeTakeFirst())errors.push('Vertical no disponible en Configuración.');
 if(subtipo&&(!tipo||!await database.selectFrom('crmSubtypes').select('id').where('name','=',subtipo).where('typeName','=',tipo).where('active','=',true).executeTakeFirst()))errors.push('Subtipo no disponible para esta vertical.');
 return errors;
}
