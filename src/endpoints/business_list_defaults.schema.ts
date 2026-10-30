import superjson from 'superjson';
import {teamDefaultsSchema,type TeamDefaults} from '../helpers/businessListPreferences';
import {apiJson} from '../helpers/apiClient';
export const getBusinessListDefaults=async():Promise<{defaults:TeamDefaults|null}>=>apiJson<{defaults:TeamDefaults|null}>('/_api/business_list_defaults');
export const saveBusinessListDefaults=async(defaults:TeamDefaults)=>apiJson<any>('/_api/business_list_defaults',{method:'POST',body:superjson.stringify(teamDefaultsSchema.parse(defaults))});
export const convertSavedViewToSystem=async(id:string)=>apiJson<{ok:true;systemView:import('../helpers/businessSystemViews').BusinessSystemView}>('/_api/business_system_view_convert',{method:'POST',body:superjson.stringify({id})});
