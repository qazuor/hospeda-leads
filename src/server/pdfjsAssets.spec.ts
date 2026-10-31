import {describe,expect,it} from 'vitest';
import {join} from 'node:path';
import {isPdfjsAssetName,pdfjsAssetFile,pdfjsAssetType} from './pdfjsAssets';

const root='/pkg/pdfjs';const at=(path:string)=>pdfjsAssetFile({path,root,version:'6.4.299'});
describe('pdfjsAssetFile (spec 102)',()=>{
 it('maps the versioned asset path to the four package folders',()=>{
  expect(at('/assets/pdfjs-6.4.299/wasm/openjpeg.wasm')).toBe(join(root,'wasm','openjpeg.wasm'));
  expect(at('/assets/pdfjs-6.4.299/cmaps/UniJIS-UTF16-H.bcmap')).toBe(join(root,'cmaps','UniJIS-UTF16-H.bcmap'));
  expect(at('/assets/pdfjs-6.4.299/iccs/CGATS001Compat-v2-micro.icc')).toBe(join(root,'iccs','CGATS001Compat-v2-micro.icc'));
  expect(at('/assets/pdfjs-6.4.299/standard_fonts/FoxitSerif.pfb')).toBe(join(root,'standard_fonts','FoxitSerif.pfb'));
 });
 it('refuses other versions, folders, subfolders and dot segments',()=>{
  for(const path of ['/assets/pdfjs-6.4.298/wasm/openjpeg.wasm','/assets/pdfjs-6.4.299/web/viewer.mjs','/assets/pdfjs-6.4.299/wasm/../package.json','/assets/pdfjs-6.4.299/wasm/a/b.wasm','/assets/pdfjs-6.4.299/wasm/','/assets/pdfjs-6.4.299/wasm/.hidden','/assets/pdfjs-6.4.299/wasm/%2e%2e'])expect(at(path)).toBeNull();
 });
 it('leaves out what getDocument never fetches: the scripting sandbox (QuickJS) and the license texts (spec 102 review)',()=>{
  for(const name of ['quickjs-eval.js','quickjs-eval.wasm','LICENSE_QCMS','LICENSE_FOXIT'])expect(isPdfjsAssetName(name)).toBe(false);
  expect(at('/assets/pdfjs-6.4.299/wasm/quickjs-eval.wasm')).toBeNull();expect(at('/assets/pdfjs-6.4.299/standard_fonts/LICENSE_FOXIT')).toBeNull();
  for(const name of ['qcms_bg.wasm','openjpeg.wasm','openjpeg_nowasm_fallback.js','jbig2.wasm','FoxitSymbol.pfb','LiberationSans-Regular.ttf','UniJIS-UTF16-H.bcmap'])expect(isPdfjsAssetName(name)).toBe(true);
 });
 it('serves wasm as application/wasm and the rest as bytes',()=>{
  expect(pdfjsAssetType('/x/openjpeg.wasm')).toBe('application/wasm');expect(pdfjsAssetType('/x/a.bcmap')).toBe('application/octet-stream');
 });
});
