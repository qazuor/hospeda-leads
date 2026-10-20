import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { hashKey, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { getLiveVersion } from "../endpoints/live_version_GET.schema";
import { useAuth } from "./useAuth";
import { LIVE_QUERY_KEYS, liveQueryKeysToInvalidate, type LiveSnapshot } from "./liveDomains";

const STORAGE_KEY="hospeda-live-mode";
const CHECK_INTERVAL=10000;
const EVENT_THROTTLE=2000;

type LiveStatus="live"|"checking"|"off"|"error";
type LiveModeState={
  enabled:boolean;
  manualRefreshing:boolean;
  status:LiveStatus;
  lastCheckedAt:Date|null;
};
type LiveModeContextValue=LiveModeState&{
  setEnabled:(enabled:boolean)=>void;
  toggle:()=>void;
  checkNow:()=>Promise<void>;
  refresh:()=>Promise<void>;
};
type LiveModeActions=Omit<LiveModeContextValue,keyof LiveModeState>;

const LiveModeStateContext=createContext<LiveModeState|null>(null);
const LiveModeActionsContext=createContext<LiveModeActions|null>(null);
const ManualRefreshingContext=createContext(false);

/** Query `meta` for infinite lists that must not refetch every loaded page on a live change: they show a manual refresh instead. */
export const LIVE_MANUAL_WHEN_PAGED={liveRefresh:"manual-when-paged"} as const;
type DeferrableQuery={meta?:Record<string,unknown>;getObserversCount:()=>number;state:{data?:unknown}};
/** True when a live change must only flag the query: it opted in, is on screen and has more than one page loaded. */
export function shouldDeferLiveRefetch(query:DeferrableQuery){
  if(query.meta?.liveRefresh!==LIVE_MANUAL_WHEN_PAGED.liveRefresh||query.getObserversCount()===0)return false;
  const pages=(query.state.data as {pages?:unknown}|undefined)?.pages;
  return Array.isArray(pages)&&pages.length>1;
}

type PendingStore={subscribe:(listener:()=>void)=>()=>void;has:(hash:string)=>boolean;mark:(hashes:Iterable<string>)=>void;clear:(hash?:string)=>void};
function createPendingStore():PendingStore{
  const pending=new Set<string>(),listeners=new Set<()=>void>();
  const notify=()=>listeners.forEach(listener=>listener());
  return {
    subscribe:listener=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    has:hash=>pending.has(hash),
    mark:hashes=>{let changed=false;for(const hash of hashes)if(!pending.has(hash)){pending.add(hash);changed=true;}if(changed)notify();},
    clear:hash=>{if(hash===undefined?pending.size===0:!pending.has(hash))return;if(hash===undefined)pending.clear();else pending.delete(hash);notify();},
  };
}
const LivePendingContext=createContext<PendingStore|null>(null);
const noSubscription=()=>()=>{};

const initialEnabled=()=>{
  if(typeof window==="undefined")return true;
  return window.localStorage.getItem(STORAGE_KEY)!=="off";
};

export function LiveModeProvider({children}:{children:ReactNode}){
  const queryClient=useQueryClient();
  const {authState}=useAuth();
  const [enabledState,setEnabledState]=useState(initialEnabled);
  const [status,setStatus]=useState<LiveStatus>(enabledState?"checking":"off");
  const [lastCheckedAt,setLastCheckedAt]=useState<Date|null>(null);
  const [manualRefreshing,setManualRefreshing]=useState(false);
  const manualRefreshLock=useRef(false);
  const lastSnapshot=useRef<LiveSnapshot|null>(null);
  const checking=useRef(false);
  const lastCheckStartedAt=useRef(0);
  const generation=useRef(0);
  const [pending]=useState(createPendingStore);

  const updateStatus=useCallback((next:LiveStatus)=>setStatus(current=>current===next?current:next),[]);

  const invalidateLiveQueries=useCallback(async(keys:readonly string[],deferPaged:boolean)=>{
    const deferred=new Set<string>();
    if(deferPaged)for(const query of queryClient.getQueryCache().getAll())if(keys.includes(String(query.queryKey[0]))&&shouldDeferLiveRefetch(query))deferred.add(query.queryHash);
    pending.mark(deferred);
    await Promise.all(keys.map(key=>queryClient.invalidateQueries(deferred.size?{queryKey:[key],predicate:query=>!deferred.has(query.queryHash)}:{queryKey:[key]})));
  },[queryClient,pending]);

  const refresh=useCallback(async()=>{
    if(manualRefreshLock.current)return;
    manualRefreshLock.current=true;setManualRefreshing(true);
    pending.clear();
    try{await invalidateLiveQueries(LIVE_QUERY_KEYS,false);}finally{manualRefreshLock.current=false;setManualRefreshing(false);}
  },[invalidateLiveQueries,pending]);

  const checkVersion=useCallback(async(manual:boolean)=>{
    if(!enabledState||authState.type!=="authenticated"||checking.current)return;
    checking.current=true;
    const checkGeneration=generation.current;
    lastCheckStartedAt.current=Date.now();
    if(manual)updateStatus("checking");
    try{
      const next=await getLiveVersion();
      if(checkGeneration!==generation.current)return;
      const previous=lastSnapshot.current;
      lastSnapshot.current=next;
      setLastCheckedAt(new Date());
      updateStatus("live");
      const keys=liveQueryKeysToInvalidate({previous,next});
      if(keys.length>0)await invalidateLiveQueries(keys,true);
    }catch{
      if(checkGeneration===generation.current)updateStatus("error");
    }finally{
      checking.current=false;
    }
  },[enabledState,authState.type,invalidateLiveQueries,updateStatus]);

  const checkNow=useCallback(()=>checkVersion(true),[checkVersion]);

  const setEnabled=useCallback((next:boolean)=>{
    setEnabledState(next);
    window.localStorage.setItem(STORAGE_KEY,next?"on":"off");
    if(!next)updateStatus("off");
    else{
      lastSnapshot.current=null;
      updateStatus("checking");
    }
  },[updateStatus]);

  useEffect(()=>{
    if(!enabledState||authState.type!=="authenticated"){
      if(!enabledState)updateStatus("off");
      return;
    }
    void checkVersion(false);
    const interval=window.setInterval(()=>{if(document.visibilityState!=="hidden")void checkVersion(false)},CHECK_INTERVAL);
    const checkOnReturn=()=>{
      if(document.visibilityState==="hidden"||Date.now()-lastCheckStartedAt.current<EVENT_THROTTLE)return;
      void checkVersion(false);
    };
    const onFocus=checkOnReturn;
    const onVisibility=checkOnReturn;
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      generation.current+=1;
      window.clearInterval(interval);
      window.removeEventListener("focus",onFocus);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[enabledState,authState.type,checkVersion,updateStatus]);

  const state=useMemo(()=>({enabled:enabledState,manualRefreshing,status,lastCheckedAt}),[enabledState,manualRefreshing,status,lastCheckedAt]);
  const actions=useMemo(()=>({setEnabled,toggle:()=>setEnabled(!enabledState),checkNow,refresh}),[setEnabled,enabledState,checkNow,refresh]);
  return <LivePendingContext.Provider value={pending}><ManualRefreshingContext.Provider value={manualRefreshing}><LiveModeStateContext.Provider value={state}><LiveModeActionsContext.Provider value={actions}>{children}</LiveModeActionsContext.Provider></LiveModeStateContext.Provider></ManualRefreshingContext.Provider></LivePendingContext.Provider>;
}

/** Whether live mode skipped refetching this query because of `LIVE_MANUAL_WHEN_PAGED`; `clear` hides the notice. */
export function useLivePendingRefresh(queryKey:QueryKey){
  const store=useContext(LivePendingContext);
  const hash=hashKey(queryKey);
  const pending=useSyncExternalStore(store?.subscribe??noSubscription,()=>store?.has(hash)??false);
  const clear=useCallback(()=>store?.clear(hash),[store,hash]);
  return {pending,clear};
}

export function useLiveModeRefreshing(){
  return useContext(ManualRefreshingContext);
}

export function useLiveMode(){
  const state=useContext(LiveModeStateContext);
  const actions=useContext(LiveModeActionsContext);
  if(!state||!actions)throw new Error("useLiveMode must be used within LiveModeProvider");
  return useMemo(()=>({...state,...actions}),[state,actions]);
}
