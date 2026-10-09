import {useCallback,useRef} from 'react';
/** One lock for an entire UI operation, including serial requests and refreshes. */
export function useOperationGuard(onError:(error:unknown)=>void){
 const locks=useRef(new Set<string>()),latestError=useRef(onError);latestError.current=onError;
 return useCallback(async(key:string,operation:()=>Promise<unknown>)=>{
  if(locks.current.has(key))return;
  locks.current.add(key);
  try{await operation()}catch(error){latestError.current(error)}finally{locks.current.delete(key)}
 },[]);
}
