import {createHash} from 'node:crypto';
import type {SavedLeadView} from '../endpoints/saved_views_GET.schema';

// Old JSON records did not have IDs. This compatibility ID is stable per owner;
// the next authorized write stores it and renames keep it unchanged.
export function savedViewIdentity(view:SavedLeadView,userId:number):string{
 return typeof view.id==='string'&&view.id.length?view.id:'legacy-'+createHash('sha256').update(JSON.stringify([userId,view.name])).digest('hex');
}
export function identifySavedViews(views:SavedLeadView[],userId:number):SavedLeadView[]{
 return views.map(view=>({...view,id:savedViewIdentity(view,userId)}));
}
