import {describe,expect,it} from 'vitest';
import {Kysely,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler,type RawBuilder} from 'kysely';
import {multiFieldSearchSql,phoneSearchSql,searchTokens} from './searchSql';

const k=new Kysely<unknown>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>({init:async()=>{},acquireConnection:async()=>{throw new Error('unused')},beginTransaction:async()=>{},commitTransaction:async()=>{},rollbackTransaction:async()=>{},releaseConnection:async()=>{},destroy:async()=>{}}),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()}});
const compile=(b:RawBuilder<boolean>)=>b.compile(k);

describe('searchTokens',()=>{
  it('splits on whitespace and caps at five words',()=>{
    expect(searchTokens('  hotel   colon ')).toEqual(['hotel','colon']);
    expect(searchTokens('a b c d e f g')).toHaveLength(5);
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('phoneSearchSql',()=>{
  it('ignores queries that are not phone numbers',()=>{
    expect(phoneSearchSql('telefono','hotel')).toBeNull();
    expect(phoneSearchSql('telefono','12345')).toBeNull();
    expect(phoneSearchSql('telefono','hotel 3515551234')).toBeNull();
  });
  it('compares digits in any typed format by substring and by the last 8 significant digits',()=>{
    const {sql,parameters}=compile(phoneSearchSql('telefono','+54 9 351 555-1234')!);
    expect(sql).toContain('translate(');
    expect(sql).toContain('right(');
    expect(parameters).toContain('%5493515551234%');
    expect(parameters).toContain('15551234');
  });
  it('tolerates the local 15 prefix in the stored value',()=>{
    expect(compile(phoneSearchSql('telefono','351 555 1234')!).parameters).toContain('%351155551234');
  });
});

describe('multiFieldSearchSql',()=>{
  it('ANDs every word across the ORed columns',()=>{
    const {sql,parameters}=compile(multiFieldSearchSql(['nombre','ciudad'],'hotel colon'));
    expect(sql.match(/ and /g)).toHaveLength(1);
    expect(parameters.filter(p=>String(p).startsWith('%'))).toEqual(['%hotel%','%hotel%','%colon%','%colon%']);
  });
  it('keeps a single word as one OR over the columns and never matches an empty query',()=>{
    expect(compile(multiFieldSearchSql(['nombre','ciudad'],'hotel')).sql).not.toContain(' and ');
    expect(compile(multiFieldSearchSql(['nombre'],'   ')).sql).toBe('false');
  });
  it('adds phone and extra alternatives only where relevant',()=>{
    const phone=compile(multiFieldSearchSql(['nombre'],'351 555 1234',{phoneColumns:['telefono']}));
    expect(phone.sql).toContain('right(');
    const text=compile(multiFieldSearchSql(['nombre'],'hotel',{phoneColumns:['telefono']}));
    expect(text.sql).not.toContain('right(');
  });
});
