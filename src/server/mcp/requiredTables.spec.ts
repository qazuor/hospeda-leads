import {describe,expect,it} from 'vitest';
import {REQUIRED_MCP_TABLES} from './requiredTables.mjs';

describe('MCP reader manifest',()=>{
 it('contains each table exactly once',()=>{
  const tables=REQUIRED_MCP_TABLES.map(item=>typeof item==='string'?item:item.table);
  expect(new Set(tables).size).toBe(tables.length);
 });
});
