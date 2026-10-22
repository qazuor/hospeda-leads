import superjson from 'superjson';
import {apiJson} from '../helpers/apiClient';
import {businessColumnGroupsSchema,type BusinessColumnGroup} from '../helpers/businessColumnGroups';
export const getBusinessColumnGroups=async():Promise<{groups:BusinessColumnGroup[]}>=>apiJson<{groups:BusinessColumnGroup[]}>('/_api/business_column_groups');
export const saveBusinessColumnGroups=async(groups:BusinessColumnGroup[])=>apiJson<{ok:true}>('/_api/business_column_groups',{method:'POST',body:superjson.stringify(businessColumnGroupsSchema.parse(groups))});
