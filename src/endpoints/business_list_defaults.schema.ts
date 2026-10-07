import superjson from 'superjson';
import {teamDefaultsSchema,type TeamDefaults} from '../helpers/businessListPreferences';
export const getBusinessListDefaults=async():Promise<{defaults:TeamDefaults|null}>=>{const r=await fetch('/_api/business_list_defaults');const data=superjson.parse<any>(await r.text());if(!r.ok)throw new Error(data.error);return data;};
export const saveBusinessListDefaults=async(defaults:TeamDefaults)=>{const r=await fetch('/_api/business_list_defaults',{method:'POST',body:superjson.stringify(teamDefaultsSchema.parse(defaults))});const data=superjson.parse<any>(await r.text());if(!r.ok)throw new Error(data.error);return data;};
