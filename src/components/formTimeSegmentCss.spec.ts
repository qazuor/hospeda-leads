import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

/**
 * Spec 104 (33), review M1: `CrmTimeInput` (Mantine `TimePicker`) draws one bordered field whose hours and minutes are two
 * `<input type=text>` segments. Form rules aimed at every input (border, padding, width, min-height) would draw a box inside the box,
 * so every rule that reaches inputs inside `.form` / `.rule` must exclude the segments (`.mantine-TimePicker-field`).
 */
const modules=['Pipeline.module.css','Commercial.module.css'];
const exclusion=':not(:where(:global(.mantine-TimePicker-field)))';
const reachesInputs=/\.(form|rule)\s+(input\b|:is\([^)]*\binput\b)/;
/** Top-level selectors of every rule (commas inside `:is(...)` / `:not(...)` do not split). */
const topLevel=(list:string)=>{const out:string[]=[];let depth=0,start=0;[...list].forEach((c,i)=>{if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&!depth){out.push(list.slice(start,i));start=i+1;}});return [...out,list.slice(start)].map(s=>s.trim());};
const selectors=(css:string)=>[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m=>topLevel(m[1]));

describe('form rules never style the time picker segments',()=>{
 for(const file of modules)it(file,()=>{
  const css=readFileSync(resolve(__dirname,file),'utf8');
  const found=selectors(css).filter(s=>reachesInputs.test(s));
  expect(found.length).toBeGreaterThan(0);
  expect(found.filter(s=>!s.includes(exclusion))).toEqual([]);
 });
});
