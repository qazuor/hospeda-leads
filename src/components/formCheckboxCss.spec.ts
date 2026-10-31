import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

/**
 * Spec 104 (28): Mantine's checkbox draws its checked box and tick on the `<input>` itself, and Mantine's styles are in a CSS layer,
 * so any unlayered form rule aimed at every `input` (background, border, padding, min-height) hides the tick. Form rules must exclude
 * checkboxes and radios, as `Communication.module.css` does.
 */
const modules=['Pipeline.module.css','Commercial.module.css'];
const broadInput=/(^|[,{}\s])\.(form|rule)\s+input(?!:not\(\[type=checkbox\]\):not\(\[type=radio\]\))(?=[\s,{])/gm;

describe('form rules never style checkbox or radio inputs',()=>{
 for(const file of modules)it(file,()=>{
  const css=readFileSync(resolve(__dirname,file),'utf8');
  expect(css.match(broadInput)??[]).toEqual([]);
 });
});
