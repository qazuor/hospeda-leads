import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getSavedLeadViews} from '../endpoints/saved_views_GET.schema';
import type {InputType,OutputType} from '../endpoints/saved_views_POST.schema';
import {availableListPreferences,preferencesFromSavedView,type ListPreferences} from './businessListPreferences';
import {applyBusinessSystemView,resolveSystemViews,type BusinessSystemView} from './businessSystemViews';
import {readBusinessViewSelection,saveBusinessViewSelection,viewPreferencesFingerprint,type BusinessViewSelection} from './businessViewSelection';

export const sellerDefaultMarkerKey=(userId:number)=>`hospeda-business-seller-default-v1-user-${userId}`;
export function readSellerDefaultMarker(userId:number){try{return localStorage.getItem(sellerDefaultMarkerKey(userId))!==null;}catch{return false;}}
export function writeSellerDefaultMarker(userId:number){try{localStorage.setItem(sellerDefaultMarkerKey(userId),'1');}catch{/* the default may then apply again next time */}}
/** Decision 4A, once per user: a non-admin without an explicit stored view selection starts on "Mis negocios" on top of their current preferences (columns and widths are kept). Null for admins, a stored selection, an already applied marker or a disabled view. */
export function sellerDefaultSelection({admin,hasSelection,hasMarker,base,systemViews,email,now}:{admin:boolean;hasSelection:boolean;hasMarker:boolean;base:ListPreferences;systemViews:BusinessSystemView[]|undefined;email:string;now?:Date}):{preferences:ListPreferences;selection:BusinessViewSelection}|null{
 const mine=resolveSystemViews(systemViews).find(view=>view.id==='mine'&&view.enabled);
 if(admin||hasSelection||hasMarker||!mine)return null;
 const preferences=availableListPreferences(applyBusinessSystemView(base,'mine',email,now));
 return {preferences,selection:{kind:'system',id:'mine',name:mine.name,baseline:preferences}};
}
const DATE_SYSTEM_VIEWS=['today','overdue','recent'];
/** Date-based system views go stale overnight: when the stored one is unmodified, recompute filters and baseline together so it is not shown as unsaved. */
export function refreshDateViewSelection({selection,preferences,email,now}:{selection:BusinessViewSelection|null;preferences:ListPreferences;email:string;now?:Date}):{preferences:ListPreferences;selection:BusinessViewSelection}|null{
 if(selection?.kind!=='system'||!DATE_SYSTEM_VIEWS.includes(selection.id))return null;
 if(viewPreferencesFingerprint(preferences)!==viewPreferencesFingerprint(selection.baseline))return null;
 const next=availableListPreferences(applyBusinessSystemView(preferences,selection.id,email,now));
 return {preferences:next,selection:{...selection,baseline:next}};
}
export function useBusinessViewSelection(userId:number,prefs:ListPreferences,systemViews:BusinessSystemView[]|undefined,defaultSelection?:BusinessViewSelection|null){
 const [active,setActive]=useState<BusinessViewSelection|null>(()=>readBusinessViewSelection(userId)??defaultSelection??null);
 const [storageError,setStorageError]=useState(false);
 const views=useQuery({queryKey:['business-saved-views',userId],queryFn:getSavedLeadViews});
 const currentView=active?.kind==='personal'?views.data?.views.find(view=>view.id===active.id&&(!view.config.entity||view.config.entity==='business')):undefined;
 const currentSystemView=active?.kind==='system'?resolveSystemViews(systemViews).find(view=>view.enabled&&view.id===active.id):undefined;
 useEffect(()=>{setStorageError(!saveBusinessViewSelection(userId,active));},[userId,active]);
 useEffect(()=>{
  if(!active)return;
  const name=active.kind==='personal'?currentView?.name:currentSystemView?.name;
  if(name&&name!==active.name)setActive(previous=>previous?{...previous,name}:null);
  else if((active.kind==='system'&&!currentSystemView)||(active.kind==='personal'&&views.isSuccess&&!currentView))setActive(null);
 },[active,currentView,currentSystemView,views.isSuccess]);
 const dirty=!!active&&viewPreferencesFingerprint(prefs)!==viewPreferencesFingerprint(active.baseline);
 function select(kind:BusinessViewSelection['kind'],id:string,name:string,preferences:ListPreferences){setActive({kind,id,name,baseline:availableListPreferences(preferences)});}
 function clear(){setActive(null);}
 function saved(input:InputType,result:OutputType){
  if(input.action==='delete'){if(active?.kind==='personal'&&(input.id?input.id===active.id:input.name===active.name))setActive(null);return;}
  if(!result.view?.id)return;
  if(input.action==='save'){
   const baseline=preferencesFromSavedView(prefs,result.view.config);
   if(baseline)select('personal',result.view.id,result.view.name,baseline);
  }else if(active?.kind==='personal'&&result.view.id===active.id){
   const baseline=preferencesFromSavedView(active.baseline,result.view.config);
   if(baseline)select('personal',result.view.id,result.view.name,baseline);
  }
 }
 return {active,select,clear,saved,currentView,dirty,storageError};
}
