import {createReadStream,existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import type {Plugin} from 'vite';

/** Spec 102: package folders pdf.js fetches on demand (wasm decoders, ICC profiles, CMaps, standard fonts). */
export const PDFJS_ASSET_DIRS=['wasm','iccs','cmaps','standard_fonts'] as const;
const TYPES:Record<string,string>={'.wasm':'application/wasm','.js':'text/javascript'};
/** Content type for a pdf.js asset: wasm must be `application/wasm` for streaming compilation; the rest is read as bytes. */
export const pdfjsAssetType=(name:string):string=>TYPES[name.slice(name.lastIndexOf('.'))]??'application/octet-stream';
/**
 * True for a file pdf.js may fetch from these folders. The QuickJS sandbox (`quickjs-eval.*`) belongs to the viewer's scripting, which
 * `getDocument` never runs, and `LICENSE*` are texts: neither is served nor copied into the build.
 */
export const isPdfjsAssetName=(name:string):boolean=>/^[\w.-]+$/.test(name)&&!name.startsWith('.')&&!/^(quickjs-eval\.|LICENSE)/.test(name);
/**
 * Maps a request path to a file of the pdfjs-dist package, or null. Only `/assets/pdfjs-<version>/<allowed folder>/<plain file name>`:
 * no subfolders, dot segments or other folders of the package.
 */
export function pdfjsAssetFile({path,root,version}:{path:string;root:string;version:string}):string|null{
 const prefix=`/assets/pdfjs-${version}/`;if(!path.startsWith(prefix))return null;
 const [dir,name,...rest]=path.slice(prefix.length).split('/');
 if(rest.length||!name||!(PDFJS_ASSET_DIRS as readonly string[]).includes(dir!)||!isPdfjsAssetName(name))return null;
 return join(root,dir!,name);
}
/**
 * Vite plugin that serves the pdf.js asset folders at `/assets/pdfjs-<version>/` (same origin, so `connect-src 'self'` allows them):
 * from the package in dev, and copied with their original names into the build (pdf.js builds the file names itself, so they cannot be hashed;
 * the versioned folder keeps the immutable cache of `/assets/` correct across upgrades).
 */
export function pdfjsAssets():Plugin{
 const root=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
 const version=(JSON.parse(readFileSync(join(root,'package.json'),'utf8')) as {version:string}).version;
 return {
  name:'pdfjs-assets',
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    const file=pdfjsAssetFile({path:(req.url??'').split('?')[0]!,root,version});
    if(!file||!existsSync(file)||!statSync(file).isFile())return next();
    res.setHeader('Content-Type',pdfjsAssetType(file));createReadStream(file).pipe(res);
   });
  },
  generateBundle(){
   for(const dir of PDFJS_ASSET_DIRS)for(const name of readdirSync(join(root,dir))){
    const file=join(root,dir,name);if(isPdfjsAssetName(name)&&statSync(file).isFile())this.emitFile({type:'asset',fileName:`assets/pdfjs-${version}/${dir}/${name}`,source:readFileSync(file)});
   }
  },
 };
}
