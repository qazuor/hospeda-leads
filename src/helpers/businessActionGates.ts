import type {CommercialDetail} from '../endpoints/commercial.schema';

/** Whether the current user may contact or edit the loaded business. */
export function canActOnBusiness(detail:CommercialDetail|undefined,authState:{type:string;user?:{role:string;email:string}}){return !!detail&&authState.type==='authenticated'&&!detail.account.archivedAt&&(authState.user?.role==='admin'||detail.account.assignedUserEmail===authState.user?.email);}

/** Shared query key for business actions and the list preview. */
export const commercialDetailKey=(accountId:string)=>['commercial-detail',accountId] as const;

/** Ignore interactive controls when deciding whether a list row body was clicked. */
export function shouldPreviewFromTarget(target:Element|null){return !!target&&!target.closest('a,button,input,label,select,textarea,[role="menu"],[role="menuitem"]');}
