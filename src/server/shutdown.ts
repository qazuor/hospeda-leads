import type {Server} from 'node:http';

export type ShutdownOptions={server:Pick<Server,'close'|'closeIdleConnections'>&Partial<Pick<Server,'closeAllConnections'>>;closeResources:()=>Promise<void>;timeoutMs?:number;exit:(code:number)=>void;log?:(message:string)=>void};

/**
 * Builds an idempotent shutdown handler: stop accepting connections, let in-flight requests finish (bounded by `timeoutMs`),
 * release resources (DB pool) and exit 0. Exits 1 when the drain times out or a step fails.
 */
export const createShutdown=({server,closeResources,timeoutMs=8000,exit,log=()=>undefined}:ShutdownOptions)=>{
  let started=false;let timedOut=false;
  return async(signal:string)=>{
    if(started)return;started=true;
    log(`${signal} received, shutting down`);
    const timer=setTimeout(()=>{timedOut=true;log(`Shutdown timed out after ${timeoutMs}ms, forcing exit`);server.closeAllConnections?.();exit(1);},timeoutMs);
    timer.unref();
    try{
      const closed=new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));
      server.closeIdleConnections();
      await closed;
      if(timedOut)return;
      await closeResources();
      clearTimeout(timer);exit(0);
    }catch(error){clearTimeout(timer);log(`Shutdown failed: ${error instanceof Error?error.message:String(error)}`);exit(1);}
  };
};
