import {describe,expect,it} from 'vitest';
import {resolveManagementSavedViewId} from './managementSavedView';
describe('management saved view ids',()=>{it('uses the id assigned by the server',()=>{expect(resolveManagementSavedViewId('persisted-id')).toBe('persisted-id');});it('does not activate a view when the server did not return an id',()=>{expect(resolveManagementSavedViewId(undefined)).toBeUndefined();});});
