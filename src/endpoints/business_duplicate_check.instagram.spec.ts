// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
vi.mock('../helpers/db',()=>({db:{}}));
import {Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler,type CompiledQuery,type DatabaseConnection,type QueryResult} from 'kysely';
import type {DB} from '../helpers/schema';
const {INSTAGRAM_SHARED,findNewDncBlocker,isBlockingMatch,withInstagramMatches}=await import('./business_duplicate_check');
const {canonicalInstagramProfile,instagramProfilePattern,normalizeInstagramUsername}=await import('../helpers/instagramChat');
const {duplicateQuery}=await import('../helpers/duplicateWarning');

describe('Instagram in the duplicate check (spec 98 §17)',()=>{
 const rows=[{id:1,perfilInstagram:'https://www.instagram.com/Cabanas_Del_Rio/?igsh=x'},{id:2,perfilInstagram:'@cabanas_del_rio'},{id:3,perfilInstagram:'https://www.instagram.com/cabanas_del_rio_2/'},{id:4,perfilInstagram:null}];
 it('flags every business whose stored profile is the same username, adding to existing matches',()=>{
  // Arrange
  const matches=[{id:'2',reasons:['Teléfono parecido'],kind:'shared_person_or_related' as const}];
  // Act
  const result=withInstagramMatches({matches,rows,username:'cabanas_del_rio'});
  // Assert
  expect(result).toEqual([{id:'2',reasons:['Teléfono parecido',INSTAGRAM_SHARED],kind:'shared_person_or_related'},{id:'1',reasons:[INSTAGRAM_SHARED],kind:'shared_person_or_related'}]);
  expect(matches[0]!.reasons).toEqual(['Teléfono parecido']);
 });
 it('adds nothing without a username and never repeats the reason',()=>{
  expect(withInstagramMatches({matches:[],rows,username:null})).toEqual([]);
  expect(withInstagramMatches({matches:[{id:'1',reasons:[INSTAGRAM_SHARED],kind:'shared_person_or_related'}],rows:rows.slice(0,1),username:'cabanas_del_rio'})[0]!.reasons).toEqual([INSTAGRAM_SHARED]);
 });
 it('an exactly shared Instagram blocks a No contactar duplicate like a shared phone',()=>{
  expect(isBlockingMatch({kind:'shared_person_or_related',reasons:[INSTAGRAM_SHARED]})).toBe(true);
  expect(isBlockingMatch({kind:'shared_person_or_related',reasons:['Teléfono parecido']})).toBe(false);
 });
 it('stores a new Instagram as the canonical profile URL and refuses anything else',()=>{
  expect(canonicalInstagramProfile('@Cabanas_Del_Rio')).toBe('https://www.instagram.com/cabanas_del_rio/');
  expect(canonicalInstagramProfile('instagram.com/cabanas.del_rio?igsh=1')).toBe('https://www.instagram.com/cabanas.del_rio/');
  expect(canonicalInstagramProfile('https://facebook.com/cabanas')).toBeNull();
  expect(canonicalInstagramProfile('no es un usuario!')).toBeNull();
 });
 it('the creation dialog asks about an Instagram only when it is a valid username',()=>{
  expect(duplicateQuery({instagram:'https://www.instagram.com/Cabanas_Del_Rio/'})).toEqual({instagram:'cabanas_del_rio'});
  expect(duplicateQuery({instagram:'no!'})).toBeNull();
 });
 it('Instagram pages that are not profiles never normalize to a username (review item 1)',()=>{
  // Arrange
  const pages=['https://www.instagram.com/p/ABC123/','https://www.instagram.com/reel/xyz/','https://www.instagram.com/reels/','https://www.instagram.com/tv/abc/','https://www.instagram.com/stories/cabanas/123/','https://www.instagram.com/explore/','https://www.instagram.com/accounts/login/?next=%2Fcabanas%2F','https://www.instagram.com/direct/t/123/','instagram.com/p/ABC','@explore','reels'];
  // Act
  const values=pages.map(value=>({value,username:normalizeInstagramUsername(value),stored:canonicalInstagramProfile(value)}));
  // Assert
  for(const v of values)expect(v,v.value).toMatchObject({username:null,stored:null});
  expect(duplicateQuery({instagram:'https://www.instagram.com/p/ABC/'})).toBeNull();
  expect(withInstagramMatches({matches:[],rows:[{id:9,perfilInstagram:'https://www.instagram.com/p/ABC/'}],username:normalizeInstagramUsername('p')})).toEqual([]);
  expect(normalizeInstagramUsername('https://www.instagram.com/cabanas.del_rio/?hl=es')).toBe('cabanas.del_rio');
 });
 it('the SQL prefilter is anchored on the profile, never a substring (review item 3)',()=>{
  const pattern=new RegExp(instagramProfilePattern('ab'),'i');
  for(const hit of ['https://www.instagram.com/AB/','@ab','ab','instagram.com/ab?igsh=1','https://m.instagram.com/ab'])expect(pattern.test(hit),hit).toBe(true);
  for(const miss of ['https://www.instagram.com/abc/','https://www.instagram.com/xab/','@a_b','https://www.instagram.com/p/ab/','facebook.com/ab'])expect(pattern.test(miss),miss).toBe(false);
  expect(new RegExp(instagramProfilePattern('a.b'),'i').test('axb'),'a dot is literal').toBe(false);
 });
});


describe('findNewDncBlocker on edits with Instagram (spec 98 §17.1, review item 4)',()=>{
 // A database whose duplicate prefilter returns the No contactar business that has the Instagram @cabanas; the matching rules decide the rest.
 const dnc={id:7,nombre:'Cabañas del Río',ciudad:'Colón',telefono:null,email:null,whatsapp:null,perfilInstagram:'@cabanas',doNotContact:true};
 const connection=(queries:string[]):DatabaseConnection=>({executeQuery:async<R>(q:CompiledQuery)=>{queries.push(q.sql);return {rows:[dnc] as unknown as R[]};},streamQuery:async function*<R>():AsyncIterableIterator<QueryResult<R>>{}});
 const fake=(queries:string[])=>new Kysely<DB>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>({init:async()=>{},acquireConnection:async()=>connection(queries),beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{},releaseConnection:async()=>{},destroy:async()=>{}}),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});
 const twin={nombre:'Otro negocio',ciudad:'Concordia',perfilInstagram:'https://www.instagram.com/cabanas/'};
 it('editing another field of a business that already shares the Instagram does not block (and never queries)',async()=>{
  // Arrange
  const queries:string[]=[];
  // Act
  const blocker=await findNewDncBlocker(fake(queries),{before:twin,after:{...twin},excludeId:'3'});
  // Assert
  expect(blocker).toBeNull();
  expect(queries).toEqual([]);
 });
 it('changing only the format of the same Instagram does not block',async()=>{
  const queries:string[]=[];
  expect(await findNewDncBlocker(fake(queries),{before:twin,after:{...twin,perfilInstagram:'@CABANAS'},excludeId:'3'})).toBeNull();
  expect(queries).toHaveLength(2);
 });
 it('editing the Instagram to the No contactar one blocks',async()=>{
  const before={nombre:'Otro negocio',ciudad:'Concordia',perfilInstagram:'@otro'};
  expect(await findNewDncBlocker(fake([]),{before,after:{...before,perfilInstagram:'instagram.com/cabanas'},excludeId:'3'})).toMatchObject({id:7,doNotContact:true});
  expect(await findNewDncBlocker(fake([]),{after:{nombre:'Nuevo',perfilInstagram:'@cabanas'}})).toMatchObject({id:7});
 });
 it('an Instagram post URL is not that profile and does not block',async()=>{
  expect(await findNewDncBlocker(fake([]),{after:{nombre:'Nuevo',perfilInstagram:'https://www.instagram.com/p/cabanas/'}})).toBeNull();
 });
});
