import {beforeEach,describe,expect,it} from 'vitest';
import {basePreferences,listPreferencesSchema,type ListPreferences} from './businessListPreferences';
import {businessViewSelectionKey,readBusinessViewSelection,saveBusinessViewSelection,viewPreferencesFingerprint} from './businessViewSelection';
describe('active business view',()=>{
 beforeEach(()=>localStorage.clear());
 it('normalizes legacy layouts, inactive loading modes, object order and unused columns',()=>{
  const original=basePreferences(),reordered={...original,widths:Object.fromEntries(Object.entries(original.widths).reverse()),pins:{...original.pins,email:'left' as const},columns:original.columns.filter(column=>column!=='email'),query:' hotel '};
  const same={...reordered,query:'hotel',pageSize:10,loadMode:'pages' as const,widths:{...reordered.widths,email:500},pins:{actions:'right' as const}};
  expect(viewPreferencesFingerprint(reordered)).toBe(viewPreferencesFingerprint(same));
  const legacy={...original,columnLayoutVersion:undefined,columns:original.columns.filter(column=>column!=='actions'),pins:{},widths:{...original.widths,actions:undefined}} as unknown as ListPreferences;
  delete legacy.widths.actions;
  expect(viewPreferencesFingerprint(legacy)).toBe(viewPreferencesFingerprint(original));
 });
 it('preserves AND/OR semantics and ignores only commutative ordering',()=>{
  const city={field:'ciudad',operator:'eq',value:'Colón'} as const,owner={field:'assignedUserEmail',operator:'eq',value:'a@example.com'} as const;
  const original={...basePreferences(),filters:[{rules:[city,owner]},{rules:[{field:'tipo',operator:'eq',value:'Alojamientos'} as const]}]};
  expect(viewPreferencesFingerprint(original)).toBe(viewPreferencesFingerprint({...original,filters:[original.filters[1],{rules:[owner,city]}]}));
  expect(viewPreferencesFingerprint(original)).not.toBe(viewPreferencesFingerprint({...original,filters:[{rules:[city]},{rules:[owner]},original.filters[1]]}));
  expect(viewPreferencesFingerprint({...original,filters:[{rules:[{field:'ciudad',operator:'empty',value:'irrelevant'}]}]})).toBe(viewPreferencesFingerprint({...original,filters:[{rules:[{field:'ciudad',operator:'empty'}]}]}));
 });
 it('detects saved configuration changes and returns to clean when reverted',()=>{
  const p=basePreferences(),fingerprint=viewPreferencesFingerprint(p);
  for(const update of [{query:'Colón'},{presentation:'grid' as const},{sortDir:'desc' as const},{columns:['nombre']},{widths:{...p.widths,nombre:300}},{legacyFilters:{classification:'open' as const}}])expect(viewPreferencesFingerprint(listPreferencesSchema.parse({...p,...update}))).not.toBe(fingerprint);
  expect(viewPreferencesFingerprint(listPreferencesSchema.parse({...p,legacyFilters:{ciudades:[]}}))).toBe(fingerprint);
 });
 it('persists the exact identity and applied baseline separately for each user',()=>{
  const selection={kind:'personal' as const,id:'stable-id',name:'Colón',baseline:basePreferences()};
  expect(saveBusinessViewSelection(3,selection)).toBe(true);expect(readBusinessViewSelection(3)).toEqual(selection);expect(readBusinessViewSelection(4)).toBeNull();
  saveBusinessViewSelection(3,null);expect(readBusinessViewSelection(3)).toBeNull();localStorage.setItem(businessViewSelectionKey(3),'broken');expect(readBusinessViewSelection(3)).toBeNull();
 });
});
