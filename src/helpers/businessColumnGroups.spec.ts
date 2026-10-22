import {afterEach,describe,expect,it} from 'vitest';
import {basePreferences,listPreferencesSchema} from './businessListPreferences';
import {businessColumnGroupsSchema,DEFAULT_BUSINESS_COLUMN_GROUPS,pruneDeletedGroupPreferences,resolveBusinessColumnGroups,resolveBusinessColumnSort} from './businessColumnGroups';
import {viewPreferencesFingerprint} from './businessViewSelection';

describe('business column groups',()=>{
 it('validates 2–6 unique data members and unique group ids',()=>{
  expect(businessColumnGroupsSchema.safeParse(DEFAULT_BUSINESS_COLUMN_GROUPS).success).toBe(true);
  expect(businessColumnGroupsSchema.safeParse([{id:'bad',name:'Bad',members:['actions','nombre']}]).success).toBe(false);
  expect(businessColumnGroupsSchema.safeParse([{id:'bad',name:'Bad',members:['nombre']}]).success).toBe(false);
  expect(businessColumnGroupsSchema.safeParse([{id:'bad',name:'Bad',members:['nombre','nombre']}]).success).toBe(false);
  expect(businessColumnGroupsSchema.safeParse([...DEFAULT_BUSINESS_COLUMN_GROUPS,...DEFAULT_BUSINESS_COLUMN_GROUPS]).success).toBe(false);
 });
 it('provides editable type and contact seeds, excluding preferred contact method',()=>{
  expect(resolveBusinessColumnGroups(null)).toEqual(DEFAULT_BUSINESS_COLUMN_GROUPS);
  expect(DEFAULT_BUSINESS_COLUMN_GROUPS[0]).toEqual({id:'classification',name:'Tipo',members:['tipo','subtipo','commercialProfile']});
  expect(DEFAULT_BUSINESS_COLUMN_GROUPS[1].members).toEqual(['contactName','telefono','contactPhone','whatsapp','email','contactEmail']);
  expect(DEFAULT_BUSINESS_COLUMN_GROUPS[1].members).not.toContain('medioContactoPreferido');
 });
 it('accepts unknown group keys without resetting other preferences and prunes deleted group references',()=>{
  const preferences=listPreferencesSchema.parse({...basePreferences(),columns:['nombre','group:deleted','ciudad','actions'],widths:{...basePreferences().widths,'group:deleted':260,ciudad:177},pins:{actions:'right','group:deleted':'left'},sortBy:'group:deleted'});
  const resolved=pruneDeletedGroupPreferences(preferences,DEFAULT_BUSINESS_COLUMN_GROUPS);
  expect(resolved.columns).toEqual(['nombre','ciudad','actions']);expect(resolved.widths).not.toHaveProperty('group:deleted');expect(resolved.widths.ciudad).toBe(177);expect(resolved.pins).not.toHaveProperty('group:deleted');expect(resolved.sortBy).toBe('nombre');
 });
 it('maps sorting to the first configured member and fingerprints preferences deterministically',()=>{
  expect(resolveBusinessColumnSort('group:classification',DEFAULT_BUSINESS_COLUMN_GROUPS)).toBe('tipo');
  expect(resolveBusinessColumnSort('group:missing',DEFAULT_BUSINESS_COLUMN_GROUPS)).toBe('nombre');
  const original=listPreferencesSchema.parse({...basePreferences(),columns:['nombre','group:classification','actions'],widths:{...basePreferences().widths,'group:classification':240}});
  const reversed={...original,widths:Object.fromEntries(Object.entries(original.widths).reverse())};
  expect(viewPreferencesFingerprint(original)).toBe(viewPreferencesFingerprint(reversed));
 });
 afterEach(()=>localStorage.clear());
});
