import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';

/** Mantine modal roots must go through the wrappers that register their layer (toasts move away from them). */
const WRAPPERS=['src/components/Dialog.tsx','src/components/ui/CrmDialog.tsx'];
const EXCEPTIONS:readonly string[]=[];
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):/\.tsx?$/.test(entry.name)&&!/\.spec\.tsx?$/.test(entry.name)?[join(dir,entry.name)]:[]);

describe('Mantine Modal and Drawer only inside the dialog wrappers (spec 104 §3.11: a panel that did not register its layer left a toast over it)',()=>{
 it('finds no Modal or Drawer imported from @mantine/core outside Dialog.tsx and CrmDialog.tsx',()=>{
  const offenders=files('src').map(file=>relative(process.cwd(),file).replaceAll('\\','/')).filter(file=>!WRAPPERS.includes(file)&&!EXCEPTIONS.includes(file))
   .filter(file=>[...readFileSync(file,'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@mantine\/core['"]/g)].some(match=>/\b(Modal|Drawer)\b/.test(match[1]??'')));
  expect(offenders).toEqual([]);
 });
});
