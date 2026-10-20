import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

  const updateStatus=useCallback((next:LiveStatus)=>setStatus(current=>current===next?current:next),[]);

  const invalidateLiveQueries=useCallback(async(keys:readonly string[]=LIVE_QUERY_KEYS)=>{
    await Promise.all(keys.map(key=>queryClient.invalidateQueries({queryKey:[key]})));
  },[queryClient]);

  const refresh=useCallback(async()=>{
    if(manualRefreshLock.current)return;
    manualRefreshLock.current=true;setManualRefreshing(true);
    try{await invalidateLiveQueries(LIVE_QUERY_KEYS);}finally{manualRefreshLock.current=false;setManualRefreshing(false);}
  },[invalidateLiveQueries]);

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
      if(keys.length>0)await invalidateLiveQueries(keys);
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
  return <ManualRefreshingContext.Provider value={manualRefreshing}><LiveModeStateContext.Provider value={state}><LiveModeActionsContext.Provider value={actions}>{children}</LiveModeActionsContext.Provider></LiveModeStateContext.Provider></ManualRefreshingContext.Provider>;
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
