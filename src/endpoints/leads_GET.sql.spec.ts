import {describe,expect,it,vi,beforeEach,afterEach} from 'vitest';
import type {CompiledQuery,DatabaseConnection,Driver,QueryResult} from 'kysely';
const h=vi.hoisted(()=>({compiled:[] as {sql:string;parameters:unknown[]}[],session:{getServerUserSession:vi.fn()}}));
vi.mock('../helpers/getServerUserSession',()=>h.session);
vi.mock('../helpers/db',async()=>{
  const {CamelCasePlugin,Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler}=await import('kysely');
  const {kyselyIdentifierOverrides}=await import('../helpers/schema');
  class Plugin extends CamelCasePlugin{protected override snakeCase(s:string):string{return kyselyIdentifierOverrides[s]??super.snakeCase(s)}}
  // Records the compiled SQL of every statement without any database; count queries get one row so the handler completes.
  class Connection implements DatabaseConnection{
    async executeQuery<R>(query:CompiledQuery):Promise<QueryResult<R>>{
      h.compiled.push({sql:query.sql,parameters:[...query.parameters]});
      return {rows:/^select count\(/i.test(query.sql)?[{count:'0'} as R]:[]};
    }
    // eslint-disable-next-line require-yield
    async *streamQuery():AsyncIterableIterator<never>{throw new Error('not supported')}
  }
  class RecordingDriver implements Driver{
    async init(){} async acquireConnection(){return new Connection()} async beginTransaction(){} async commitTransaction(){} async rollbackTransaction(){} async releaseConnection(){} async destroy(){}
  }
  return {db:new Kysely({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new RecordingDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()},plugins:[new Plugin()]})};
});
import {handle} from './leads_GET';

const user={id:7,email:'seller@example.com',displayName:'Vendedor Ñandú',role:'seller'};
const admin={...user,role:'admin'};
const json=(value:unknown)=>JSON.stringify(value);
const rule=(field:string,operator:string,value?:string,value2?:string)=>({field,operator,...(value===undefined?{}:{value}),...(value2===undefined?{}:{value2})});
// Each case is a query string; the matrix covers every branch of the filter builder.
const cases:Record<string,{query:Record<string,string>;user?:typeof user}>={
  'business default':{query:{entity:'business',pageSize:'50',sortBy:'nombre',sortDir:'asc'}},
  'opportunity default seller':{query:{entity:'opportunity'}},
  'opportunity default admin':{query:{entity:'opportunity'},user:admin},
  'quick search with ñ and accents':{query:{entity:'business',q:'Ñandú José cañón'}},
  'quick search by name and city':{query:{entity:'business',q:'hotel Colón'}},
  'quick search by phone in another format':{query:{entity:'business',q:'+54 9 351 555-1234'}},
  'set filters include/exclude':{query:{entity:'business',ciudades:json(['Paraná','__EMPTY__']),excludeCiudades:json(['Gualeguay']),estados:json(['Nuevo']),excludeEstados:json(['__EMPTY__','Perdido']),prioridades:json(['Alta','__EMPTY__']),excludePrioridades:json(['__EMPTY__']),asignados:json(['A','B']),suscripciones:json(['__EMPTY__']),excludeOrigenes:json(['__EMPTY__','web']),origenes:json(['x']),quienesCargaron:json(['q']),mediosContacto:json(['m']),creadosPor:json(['c']),excludeCreadosPor:json(['d']),tipos:json(['t']),subtipos:json(['s']),commercialProfiles:json(['p']),assignedUsers:json(['u@example.com'])}},
  'singular legacy filters':{query:{ciudad:'Paraná',estado:'Nuevo',tipo:'Hotel',subtipo:'3',commercialProfile:'p',prioridad:'Alta',asignado:'A',assignedUser:'u@x.com'}},
  'text filters all modes':{query:{entity:'business',textFilters:json([{field:'nombre',mode:'contains',value:' Ñu '},{field:'email',mode:'not_contains',value:'Gmail'},{field:'telefono',mode:'equals',value:'123'},{field:'contactPhone',mode:'contains',value:'222'},{field:'contactEmail',mode:'equals',value:'ana@example.com'},{field:'whatsapp',mode:'not_empty'},{field:'sitioWeb',mode:'not_equals',value:'x'},{field:'contactName',mode:'empty'},{field:'urlGmap',mode:'not_empty'},{field:'archivoAdjunto',mode:'contains',value:''}])}},
  'date filters':{query:{entity:'business',dateFilters:json([{field:'fechaCreacion',from:'2026-01-02',to:'2026-02-03'},{field:'createdAt',from:'2026-01-02',to:'2026-02-03'},{field:'updatedAt',presence:'with'},{field:'fechaProximaAccion',presence:'without'},{field:'fechaUltimoContacto',presence:'all',from:'2026-03-01'}])}},
  'ids recurrent flags':{query:{idExact:' 5 ',idMin:'2',idMax:'9',recurrent:'true'}},
  'recurrent false':{query:{recurrent:'false'}},
  'notes contains':{query:{notesMode:'contains',notesText:'Ñoño'}},
  'notes not_equals':{query:{notesMode:'not_equals',notesText:'x'}},
  'notes empty':{query:{notesMode:'empty'}},
  'notes not_empty':{query:{notesMode:'not_empty'}},
  'filter groups AND of OR':{query:{entity:'business',filterGroups:json([
    {rules:[rule('ciudad','eq','Paraná'),rule('ciudad','eq','__EMPTY__'),rule('estado','neq','Perdido')]},
    {rules:[rule('nombre','contains','Ñandú'),rule('email','not_contains','x'),rule('telefono','eq','1'),rule('sitioWeb','neq','y'),rule('urlGmap','empty'),rule('perfilInstagram','not_empty')]},
  ])}},
  'filter groups current user':{query:{entity:'business',filterGroups:json([{rules:[rule('assignedUserEmail','eq','__CURRENT_USER__'),rule('creadoPor','neq','__CURRENT_USER__'),rule('quienCargo','neq','__EMPTY__'),rule('asignadoA','empty'),rule('prioridad','not_empty')]}])}},
  'filter groups current user on non user field':{query:{filterGroups:json([{rules:[rule('ciudad','eq','__CURRENT_USER__'),rule('tipo','neq','__CURRENT_USER__')]}])}},
  'filter groups dates':{query:{entity:'business',filterGroups:json([{rules:[
    rule('fechaCreacion','on','2026-01-02'),rule('fechaUltimoContacto','before','2026-01-02'),rule('fechaProximaAccion','after','2026-01-02'),rule('fechaCreacion','between','2026-01-02','2026-02-02'),
    rule('createdAt','on','2026-01-02'),rule('updatedAt','before','2026-01-02'),rule('createdAt','after','2026-01-02'),rule('updatedAt','between','2026-01-02','2026-02-02'),rule('createdAt','empty'),rule('updatedAt','not_empty'),rule('createdAt','on','')]}])}},
  'filter groups notes':{query:{filterGroups:json([{rules:[rule('notes','contains','Ñu'),rule('notes','not_contains','x'),rule('notes','eq','a'),rule('notes','neq','b'),rule('notes','empty'),rule('notes','not_empty')]}])}},
  'filter groups misc':{query:{entity:'business',filterGroups:json([{rules:[rule('clientePotencialRecurrente','is_true'),rule('clientePotencialRecurrente','is_false'),rule('reviewStatus','is_true'),rule('reviewStatus','is_false'),rule('businessStatus','empty'),rule('businessStatus','not_empty'),rule('businessStatus','eq','active'),rule('businessStatus','neq','new'),rule('id','eq','4'),rule('id','gte','4'),rule('id','lte','8'),rule('id','between','4','8')]}])}},
  'filter groups fallthrough':{query:{filterGroups:json([{rules:[rule('id','contains','x'),rule('nombre','gte','x'),rule('clientePotencialRecurrente','eq','x'),rule('reviewStatus','eq')]}])}},
  'deleted filter admin':{query:{entity:'business',filterGroups:json([{rules:[rule('deletedAt','is_true')]}])},user:admin},
  'deleted filter admin false':{query:{filterGroups:json([{rules:[rule('deletedAt','is_false')]}])},user:admin},
  'contact presence + inactivity + next action':{query:{entity:'business',contactPresence:'contacted',inactiveDays:'30',nextAction:'overdue'}},
  'no contact + next action with':{query:{contactPresence:'noContact',nextAction:'with'}},
  'next action without':{query:{nextAction:'without'}},
  'classification and commercial status':{query:{classification:'won',commercialStatus:'client'}},
  'business sorts businessStatus':{query:{entity:'business',sortBy:'businessStatus',sortDir:'desc'}},
  'opportunity sorts businessStatus':{query:{sortBy:'businessStatus',sortDir:'asc'}},
  'opportunity sorts reviewStatus':{query:{sortBy:'reviewStatus',sortDir:'desc'}},
  'sort by column':{query:{sortBy:'ciudad',sortDir:'asc'}},
  'default sort':{query:{}},
  'anchor page':{query:{entity:'business',anchorAccountId:'12',alignAnchorPage:'true',pageSize:'25',page:'3'}},
  'board view':{query:{entity:'business',view:'board'}},
  'board view opportunity totals':{query:{entity:'opportunity',view:'board',classification:'open'}},
  'filter options include':{query:{entity:'business',filterOptions:'include'}},
};

describe('leads_GET compiled SQL (no behavior change)',()=>{
  beforeEach(()=>{h.compiled.length=0;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))});
  afterEach(()=>{vi.useRealTimers()});
  for(const [name,{query,user:who}] of Object.entries(cases)){
    it(`compiles ${name}`,async()=>{
      h.session.getServerUserSession.mockResolvedValue({user:who??user});
      const response=await handle(new Request('http://x/_api/leads?'+new URLSearchParams(query)));
      expect(response.status).toBe(200);
      const normalized=h.compiled.map(({sql,parameters})=>({sql,parameters:parameters.map(p=>p instanceof Date?'Date:'+p.toISOString():p)}));
      await expect(JSON.stringify(normalized,null,1)+'\n').toMatchFileSnapshot(`./__sql_snapshots__/leads_GET/${name.replace(/[^a-z0-9]+/gi,'-')}.json`);
    });
  }
});
