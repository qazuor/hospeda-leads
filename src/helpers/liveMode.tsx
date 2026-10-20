import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { hashKey, useQueryClient, type MutationCacheConfig, type QueryKey } from "@tanstack/react-query";
import { getLiveVersion } from "../endpoints/live_version_GET.schema";
import { useAuth } from "./useAuth";
import { LIVE_QUERY_KEYS, liveChangeTime, liveChangeWindow, liveLoadIncludes, liveQueryKeysToInvalidate, type LiveChange, type LiveSnapshot } from "./liveDomains";

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

/**
 * Flags per query hash, holding the browser time at which the latest flagging poll answered. Every change it reported
 * was already committed, so any full load started at or after that time includes it.
 */
type PendingStore={subscribe:(listener:()=>void)=>()=>void;has:(hash:string)=>boolean;markedAt:(hash:string)=>number|undefined;mark:(hash:string,markedAt:number)=>void;clear:(hash?:string)=>void};
function createPendingStore():PendingStore{
  const pending=new Map<string,number>(),listeners=new Set<()=>void>();
  const notify=()=>listeners.forEach(listener=>listener());
  return {
    subscribe:listener=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    has:hash=>pending.has(hash),
    markedAt:hash=>pending.get(hash),
    mark:(hash,markedAt)=>{const current=pending.get(hash);pending.set(hash,current===undefined?markedAt:Math.max(current,markedAt));if(current===undefined)notify();},
    clear:hash=>{if(hash===undefined?pending.size===0:!pending.has(hash))return;if(hash===undefined)pending.clear();else pending.delete(hash);notify();},
  };
}
type MutationSuccessHandler=NonNullable<MutationCacheConfig["onSuccess"]>;
/** Live-mode wrappers installed on `MutationCache.config.onSuccess`, with the handler each one wraps. */
const stampWrappers=new WeakMap<MutationSuccessHandler,{previous:MutationSuccessHandler|undefined;state:{disposed:boolean}}>();
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
  /** Browser time at which the running and the last successful full (not next-page) fetch of each query started. */
  const fetchStartedAt=useRef(new Map<string,number>());
  const freshFrom=useRef(new Map<string,number>());
  /** Browser time of the latest successful own mutation response (it arrives after that mutation's COMMIT). */
  const lastOwnMutationAt=useRef<number|undefined>(undefined);

  // The mutation cache `onSuccess` runs as soon as the response arrives, before the mutation's own `onSuccess` refetches.
  useEffect(()=>{
    const config=queryClient.getMutationCache().config,previous=config.onSuccess;
    const state={disposed:false};
    const stamp:MutationSuccessHandler=(...args)=>{if(!state.disposed)lastOwnMutationAt.current=Date.now();return previous?.(...args);};
    stampWrappers.set(stamp,{previous,state});
    config.onSuccess=stamp;
    return ()=>{
      state.disposed=true;
      // Restore only our own wrapper, skipping wrappers of providers that were unmounted out of order.
      if(config.onSuccess!==stamp)return;
      let next=previous;
      for(let entry=next&&stampWrappers.get(next);entry?.state.disposed;entry=next&&stampWrappers.get(next))next=entry.previous;
      config.onSuccess=next;
    };
  },[queryClient]);

  useEffect(()=>queryClient.getQueryCache().subscribe(event=>{
    if(event.type==="removed"){fetchStartedAt.current.delete(event.query.queryHash);freshFrom.current.delete(event.query.queryHash);return;}
    if(event.type!=="updated"||event.query.state.fetchMeta?.fetchMore)return;
    const hash=event.query.queryHash;
    if(event.action.type==="fetch"){fetchStartedAt.current.set(hash,Date.now());return;}
    if(event.action.type!=="success"||event.action.manual)return;
    const startedAt=fetchStartedAt.current.get(hash);
    if(startedAt!==undefined)freshFrom.current.set(hash,startedAt);
    // A full refetch that started once the flagging poll had answered already shows the change, whatever triggered it.
    const markedAt=pending.markedAt(hash);
    if(markedAt!==undefined&&startedAt!==undefined&&startedAt>=markedAt)pending.clear(hash);
  }),[queryClient,pending]);

  const updateStatus=useCallback((next:LiveStatus)=>setStatus(current=>current===next?current:next),[]);

  const invalidateLiveQueries=useCallback(async(keys:readonly string[],deferPaged:boolean,change:LiveChange|null=null,markedAt=Date.now())=>{
    const deferred=new Set<string>();
    if(deferPaged)for(const query of queryClient.getQueryCache().getAll())if(keys.includes(String(query.queryKey[0]))&&shouldDeferLiveRefetch(query)){
      deferred.add(query.queryHash);
      // Data whose last full fetch already includes the change (after the margin, or after the user's own edit response) stays as is.
      if(!liveLoadIncludes({startedAt:freshFrom.current.get(query.queryHash),change,lastOwnMutationAt:lastOwnMutationAt.current}))pending.mark(query.queryHash,markedAt);
    }
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
      const sentAt=Date.now();
      const next=await getLiveVersion();
      const receivedAt=Date.now();
      if(checkGeneration!==generation.current)return;
      const previous=lastSnapshot.current;
      lastSnapshot.current=next;
      setLastCheckedAt(new Date());
      updateStatus("live");
      const keys=liveQueryKeysToInvalidate({previous,next});
      if(keys.length>0){
        const serverTime=liveChangeTime({previous,next});
        await invalidateLiveQueries(keys,true,serverTime===null?null:liveChangeWindow({serverTime,snapshot:next,sentAt,receivedAt}),receivedAt);
      }
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
