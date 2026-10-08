import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getSavedLeadViews} from '../endpoints/saved_views_GET.schema';
import type {InputType,OutputType} from '../endpoints/saved_views_POST.schema';
import {availableListPreferences,preferencesFromSavedView,type ListPreferences} from './businessListPreferences';
import {defaultSystemViews,type BusinessSystemView} from './businessSystemViews';
import {readBusinessViewSelection,saveBusinessViewSelection,viewPreferencesFingerprint,type BusinessViewSelection} from './businessViewSelection';

export function useBusinessViewSelection(userId:number,prefs:ListPreferences,systemViews:BusinessSystemView[]|undefined){
 const [active,setActive]=useState<BusinessViewSelection|null>(()=>readBusinessViewSelection(userId));
 const [storageError,setStorageError]=useState(false);
 const views=useQuery({queryKey:['business-saved-views',userId],queryFn:getSavedLeadViews});
 const currentView=active?.kind==='personal'?views.data?.views.find(view=>view.id===active.id&&(!view.config.entity||view.config.entity==='business')):undefined;
 const currentSystemView=active?.kind==='system'?(systemViews??defaultSystemViews()).find(view=>view.enabled&&view.id===active.id):undefined;
 useEffect(()=>{setStorageError(!saveBusinessViewSelection(userId,active));},[userId,active]);
 useEffect(()=>{
  if(!active)return;
  const name=active.kind==='personal'?currentView?.name:currentSystemView?.name;
  if(name&&name!==active.name)setActive(previous=>previous?{...previous,name}:null);
  else if((active.kind==='system'&&!currentSystemView)||(active.kind==='personal'&&views.isSuccess&&!currentView))setActive(null);
 },[active,currentView,currentSystemView,views.isSuccess]);
 const dirty=!!active&&viewPreferencesFingerprint(prefs)!==viewPreferencesFingerprint(active.baseline);
 function select(kind:BusinessViewSelection['kind'],id:string,name:string,preferences:ListPreferences){setActive({kind,id,name,baseline:availableListPreferences(preferences)});}
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
 return {active,select,saved,currentView,dirty,storageError};
}
