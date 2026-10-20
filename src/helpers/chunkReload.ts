const KEY='crm-chunk-reload-at',WINDOW_MS=30_000;
const CHUNK_PATTERNS=[/Failed to fetch dynamically imported module/i,/Importing a module script failed/i,/error loading dynamically imported module/i,/ChunkLoadError/i];

/** True when the error comes from a lazy chunk that could not be loaded (typically a stale asset after a deploy). */
export function isChunkLoadError(error:unknown):boolean{
  if(!error)return false;
  const text=error instanceof Error?error.name+' '+error.message:typeof error==='string'?error:'';
  return CHUNK_PATTERNS.some(pattern=>pattern.test(text));
}

/** Reloads the page at most once per 30 s to recover from a stale chunk. Returns true when a reload was triggered. Storage failures are tolerated (no storage means no loop guard, so it reloads only when storage is readable and writable). */
export function reloadOnceForStaleChunk({now=Date.now(),reload=()=>window.location.reload()}:{now?:number;reload?:()=>void}={}):boolean{
  try{
    const last=Number(window.sessionStorage.getItem(KEY));
    if(Number.isFinite(last)&&last>0&&now-last<WINDOW_MS)return false;
    window.sessionStorage.setItem(KEY,String(now));
  }catch{return false;}
  reload();
  return true;
}
