import {useCallback,useEffect,useState} from 'react';

/** Server flags for the first-use checklist (`GET /_api/work?mode=day`). */
export type FirstStepFlags={contacted:boolean;logged:boolean;scheduled:boolean};
export type FirstStepItem={key:'opened'|'contacted'|'logged'|'scheduled';label:string;done:boolean};

/** The four first-use steps in order; each one is done only from a real action (never from merely seeing a screen). */
export function firstStepItems({flags,opened}:{flags:FirstStepFlags;opened:boolean}):FirstStepItem[]{
 return [
  {key:'opened',label:'Abrí una tarea',done:opened},
  {key:'contacted',label:'Contactá a un negocio',done:flags.contacted},
  {key:'logged',label:'Anotá cómo salió',done:flags.logged},
  {key:'scheduled',label:'Agendá la próxima tarea',done:flags.scheduled}
 ];
}
/** Visible while at least one step is pending and she did not dismiss it. */
export const showFirstSteps=({items,dismissed}:{items:readonly FirstStepItem[];dismissed:boolean}):boolean=>!dismissed&&items.some(i=>!i.done);

const key=(name:'opened'|'dismissed',email:string)=>`hospeda-first-steps-${name}:${email.toLowerCase()}`;
function read(name:'opened'|'dismissed',email:string):boolean{try{return window.localStorage.getItem(key(name,email))==='1'}catch{return false}}
function write(name:'opened'|'dismissed',email:string){try{window.localStorage.setItem(key(name,email),'1')}catch{/* storage blocked: the flag lasts only for this visit */}}

/** Per-user browser flags: step 1 ("open a task") and "hide the checklist". The other three steps come from the server. */
export function useFirstStepsStorage({email}:{email:string|undefined}){
 const [state,setState]=useState({opened:false,dismissed:false});
 useEffect(()=>{setState(email?{opened:read('opened',email),dismissed:read('dismissed',email)}:{opened:false,dismissed:false});},[email]);
 const markOpened=useCallback(()=>{if(!email)return;write('opened',email);setState(s=>s.opened?s:{...s,opened:true});},[email]);
 const dismiss=useCallback(()=>{if(!email)return;write('dismissed',email);setState(s=>({...s,dismissed:true}));},[email]);
 return {...state,markOpened,dismiss};
}
