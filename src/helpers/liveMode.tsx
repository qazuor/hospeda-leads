import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getLiveVersion } from "../endpoints/live_version_GET.schema";
import { useAuth } from "./useAuth";

const STORAGE_KEY="hospeda-live-mode";
const CHECK_INTERVAL=2500;
const LIVE_QUERY_KEYS=[
  "data-quality","pipeline","work","commercial","commercial-detail","leads","lead-stats","settings","analytics","lead-duplicates","lead-notes",
  "lead-journal","global-journal","global-journal-filtered","trash-leads"
];

type LiveStatus="live"|"checking"|"off"|"error";
type LiveModeContextValue={
  enabled:boolean;
  status:LiveStatus;
  lastCheckedAt:Date|null;
  setEnabled:(enabled:boolean)=>void;
  toggle:()=>void;
  checkNow:()=>Promise<void>;
};

const LiveModeContext=createContext<LiveModeContextValue|null>(null);

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
  const lastVersion=useRef<string|null>(null);
  const checking=useRef(false);

  const invalidateLiveQueries=useCallback(async()=>{
    await Promise.all(LIVE_QUERY_KEYS.map(key=>queryClient.invalidateQueries({queryKey:[key]})));
  },[queryClient]);

  const checkNow=useCallback(async()=>{
    if(!enabledState||authState.type!=="authenticated"||checking.current)return;
    checking.current=true;
    setStatus("checking");
    try{
      const {version}=await getLiveVersion();
      const previous=lastVersion.current;
      lastVersion.current=version;
      setLastCheckedAt(new Date());
      setStatus("live");
      if(previous!==null&&previous!==version)await invalidateLiveQueries();
    }catch{
      setStatus("error");
    }finally{
      checking.current=false;
    }
  },[enabledState,authState.type,invalidateLiveQueries]);

  const setEnabled=useCallback((next:boolean)=>{
    setEnabledState(next);
    window.localStorage.setItem(STORAGE_KEY,next?"on":"off");
    if(!next)setStatus("off");
    else{
      lastVersion.current=null;
      setStatus("checking");
    }
  },[]);

  useEffect(()=>{
    if(!enabledState||authState.type!=="authenticated"){
      if(!enabledState)setStatus("off");
      return;
    }
    void checkNow();
    const interval=window.setInterval(()=>void checkNow(),CHECK_INTERVAL);
    const onFocus=()=>void checkNow();
    const onVisibility=()=>{if(document.visibilityState==="visible")void checkNow()};
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      window.clearInterval(interval);
      window.removeEventListener("focus",onFocus);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[enabledState,authState.type,checkNow]);

  return <LiveModeContext.Provider value={{
    enabled:enabledState,status,lastCheckedAt,setEnabled,
    toggle:()=>setEnabled(!enabledState),checkNow
  }}>{children}</LiveModeContext.Provider>;
}

export function useLiveMode(){
  const context=useContext(LiveModeContext);
  if(!context)throw new Error("useLiveMode must be used within LiveModeProvider");
  return context;
}