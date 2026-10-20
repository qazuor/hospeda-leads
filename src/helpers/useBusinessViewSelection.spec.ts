import {describe,it,expect} from 'vitest';
import {sellerDefaultSelection} from './useBusinessViewSelection';
import {basePreferences} from './businessListPreferences';
import {defaultSystemViews} from './businessSystemViews';
const base={admin:false,hasStoredState:false,base:basePreferences(),systemViews:undefined,email:'marta@x.com'};
describe('seller default view',()=>{
 it('starts a seller with empty state on Mis negocios, filtered by their email',()=>{const r=sellerDefaultSelection(base)!;expect(r.selection).toMatchObject({kind:'system',id:'mine',name:'Mis negocios'});expect(r.preferences.filters).toEqual([{rules:[{field:'assignedUserEmail',operator:'eq',value:'marta@x.com'}]}]);expect(r.selection.baseline).toEqual(r.preferences);expect(r.preferences.columns).toEqual(basePreferences().columns);});
 it('does not apply to admins, stored preferences/selection or a disabled view',()=>{expect(sellerDefaultSelection({...base,admin:true})).toBeNull();expect(sellerDefaultSelection({...base,hasStoredState:true})).toBeNull();expect(sellerDefaultSelection({...base,systemViews:defaultSystemViews().map(v=>({...v,enabled:v.id!=='mine'}))})).toBeNull();});
 it('uses the team-renamed name of the view',()=>{expect(sellerDefaultSelection({...base,systemViews:defaultSystemViews().map(v=>v.id==='mine'?{...v,name:'Los míos'}:v)})!.selection.name).toBe('Los míos');});
});
