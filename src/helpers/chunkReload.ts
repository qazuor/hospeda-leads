const KEY='crm-chunk-reload-at',WINDOW_MS=30_000;
const CHUNK_PATTERNS=[/Failed to fetch dynamically imported module/i,/Importing a module script failed/i,/error loading dynamically imported module/i,/ChunkLoadError/i,/Expected the result of a dynamic import\(\) call/i];
let staleChunk=false;

/** Records that a chunk failed to load, so the UI can show the "new version" copy even when the error that reaches React is generic. */
export function markStaleChunk():void{staleChunk=true;}
/** True once a chunk load failure has been observed in this page session. */
export function hasStaleChunk():boolean{return staleChunk;}
/** Test helper: clears the stale-chunk flag. */
export function resetStaleChunk():void{staleChunk=false;}

/** Handles Vite's `vite:preloadError`: suppresses the raw error, marks the stale chunk and reloads once (guarded). */
export function handlePreloadError(event:Pick<Event,'preventDefault'>):void{event.preventDefault();markStaleChunk();reloadOnceForStaleChunk();}

/** Registers the `vite:preloadError` handler on the given target (the window by default). */
export function installPreloadErrorHandler(target:Pick<Window,'addEventListener'>=window):void{target.addEventListener('vite:preloadError',handlePreloadError);}

/** True when the error comes from a lazy chunk that could not be loaded (typically a stale asset after a deploy). */
export function isChunkLoadError(error:unknown):boolean{
  if(!error)return false;
  const text=error instanceof Error?error.name+' '+error.message:typeof error==='string'?error:'';
  return CHUNK_PATTERNS.some(pattern=>pattern.test(text));
}

/** Reloads the page unless a reload already happened in the last 30 s. Returns true when a reload was triggered. If sessionStorage is unavailable the guard cannot be kept, so it does not reload (returns false) to rule out a reload loop. */
export function reloadOnceForStaleChunk({now=Date.now(),reload=()=>window.location.reload()}:{now?:number;reload?:()=>void}={}):boolean{
  try{
    const last=Number(window.sessionStorage.getItem(KEY));
    if(Number.isFinite(last)&&last>0&&now-last<WINDOW_MS)return false;
    window.sessionStorage.setItem(KEY,String(now));
  }catch{return false;}
  reload();
  return true;
}
