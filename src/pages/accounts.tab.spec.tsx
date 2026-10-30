import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation,useNavigate} from 'react-router-dom';
import {useEffect} from 'react';
import {useBusinessTab} from '../helpers/useBusinessTab';

// Spec 91 §13: the business tab lives in ?tab=. CommercialPanel is replaced by a probe that uses the real hook, so the test
// checks the page wiring (no remount on a tab change, remount on a new navigation) without the panel's data.
const mounts=vi.hoisted(()=>({count:0}));
vi.mock('../components/CommercialPanel',()=>({CommercialPanel:({navigationKey,readOnly=false}:{navigationKey?:string;readOnly?:boolean})=>{
 const {section,setSection}=useBusinessTab({readOnly,syncUrl:true,navigationKey});
 useEffect(()=>{mounts.count++},[]);
 return <div><p>Tab: {section}</p>{['resumen','historial','comunicacion','documentos'].map(tab=><button key={tab} onClick={()=>setSection(tab)}>{tab}</button>)}</div>;
}}));
import AccountsPage from './accounts';

let location:ReturnType<typeof useLocation>|null=null,navigate:ReturnType<typeof useNavigate>|null=null;
function Spy(){location=useLocation();navigate=useNavigate();return null}
const show=(entry:string,entries:string[]=[entry])=>render(<MemoryRouter initialEntries={entries} initialIndex={entries.length-1}><Spy/><Routes><Route path="/accounts/:accountId" element={<AccountsPage/>}/><Route path="*" element={<p>Otra página</p>}/></Routes></MemoryRouter>);
afterEach(()=>{cleanup();mounts.count=0;location=null;navigate=null});

describe('business page tab in the URL (spec 91 §13)',()=>{
 it('opens the tab from ?tab= and falls back to Resumen for an unknown value',()=>{
  show('/accounts/5?tab=comunicacion');expect(screen.getByText('Tab: comunicacion')).toBeTruthy();
  cleanup();show('/accounts/5?tab=inexistente');expect(screen.getByText('Tab: resumen')).toBeTruthy();
  cleanup();show('/accounts/5?section=communication');expect(screen.getByText('Tab: comunicacion')).toBeTruthy();
 });
 it('writes ?tab= on change, keeps other params, replaces the entry and does not remount the panel',()=>{
  show('/accounts/5?contactId=7',['/otra','/accounts/5?contactId=7']);
  fireEvent.click(screen.getByRole('button',{name:'comunicacion'}));
  expect(location?.search).toBe('?contactId=7&tab=comunicacion');expect(screen.getByText('Tab: comunicacion')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'documentos'}));
  expect(location?.search).toBe('?contactId=7&tab=documentos');
  fireEvent.click(screen.getByRole('button',{name:'resumen'}));
  expect(location?.search).toBe('?contactId=7');
  expect(mounts.count).toBe(1);
  // Replace: Back leaves the business page instead of walking through the tabs.
  act(()=>navigate?.(-1));expect(screen.getByText('Otra página')).toBeTruthy();
 });
 it('remounts on a new navigation to the same business, which then opens the linked tab',()=>{
  show('/accounts/5');
  fireEvent.click(screen.getByRole('button',{name:'historial'}));expect(mounts.count).toBe(1);
  act(()=>navigate?.('/accounts/5?tab=comunicacion'));
  expect(mounts.count).toBe(2);expect(screen.getByText('Tab: comunicacion')).toBeTruthy();
 });
});
