import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {businessSection,businessTabParams,initialBusinessSection} from './businessSections';

/**
 * Spec 91 §13: the open tab of the business page, kept in `?tab=` so a reload or a shared link opens it again. The initial
 * tab comes from `?tab=` (or the legacy `?section=`); a change replaces the history entry, so Back leaves the page instead of
 * walking through tabs, and carries `navigationKey` in the location state so the page keeps the panel mounted.
 * With `syncUrl` false (the panel embedded in a management) the tab stays local.
 */
export function useBusinessTab({readOnly,syncUrl,navigationKey}:{readOnly:boolean;syncUrl:boolean;navigationKey?:string}){
 const [params,setParams]=useSearchParams();
 const [section,setSectionState]=useState<string>(()=>params.get('section')==='work'&&readOnly?'resumen':initialBusinessSection(params));
 const setSection=(next:string)=>{
  setSectionState(next);
  if(syncUrl)setParams(current=>businessTabParams(current,businessSection(next)),{replace:true,state:{panelKey:navigationKey}});
 };
 return {section,setSection,params} as const;
}
