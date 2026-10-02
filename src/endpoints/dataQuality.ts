import superjson from 'superjson';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {qualityMutation} from './dataQuality.schema';
import {mutateQuality,QualityForbidden,QualityConflict,qualityConfig} from '../helpers/dataQualityService';
import {accountFamily,resolveAccount} from '../helpers/accountIdentity';
import {businessFields,normalizeField,dataFieldLabels} from '../helpers/dataNormalization';
const reply=(v:unknown,status=200)=>new Response(superjson.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const fail=(e:unknown)=>reply({error:e instanceof Error?e.message:'Error de calidad de datos'},e instanceof NotAuthenticatedError?401:e instanceof QualityForbidden?403:e instanceof QualityConflict?409:400);
export async function post(request:Request){try{const {user}=await getServerUserSession(request);return reply(await mutateQuality(db,qualityMutation.parse(superjson.parse(await request.text())),user));}catch(e){return fail(e);}}
export async function get(request:Request){try{
 const {user}=await getServerUserSession(request);const config=await qualityConfig(db),id=new URL(request.url).searchParams.get('accountId');
 if(!id)return reply({config,canEdit:false,fields:[],evidence:[],merges:[]});
 const accountId=await resolveAccount(db,id),family=await accountFamily(db,accountId);
 const [account,contacts,evidence,merges]=await Promise.all([
  db.selectFrom('crmAccounts').selectAll().where('id','=',accountId).executeTakeFirstOrThrow(),
  db.selectFrom('crmContacts').selectAll().where('accountId','=',accountId).where('deletedAt','is',null).execute(),
  db.selectFrom('crmDataEvidence').selectAll().where('accountId','=',accountId).orderBy('id','desc').execute(),
  db.selectFrom('crmAccountMerges').selectAll().where('destinationId','in',family).orderBy('id','desc').execute()
 ]);
 const fields=[...businessFields.map(field=>({field,label:dataFieldLabels[field],...normalizeField(field,account[field]),revision:account.updatedAt.toISOString(),contactId:undefined as string|undefined})),...contacts.flatMap(c=>['name','phone','email'].map(field=>({field,label:c.name+' · '+dataFieldLabels[field],...normalizeField(field,String(c[field as keyof typeof c]??'')),revision:c.updatedAt.toISOString(),contactId:String(c.id)})))].map(f=>{
  const latest=evidence.find(e=>e.field===f.field&&String(e.contactId??'')===String(f.contactId??'')&&!e.leadId);
  return {...f,latest,stale:!!latest&&latest.originalValue!==f.original};
 });
 return reply({config,canEdit:user.role==='admin'||account.assignedUserEmail===user.email,fields,evidence,merges});
}catch(e){return fail(e);}}
