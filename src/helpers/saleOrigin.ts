/** Section a management page was opened from. Links pass it as router state: `<Link to={'/sales/'+id} state={{from:'my-day'}}>`. */
export type SaleOrigin='my-day'|'business'|'opportunities';

/**
 * "← Volver a {origen}" link of the management page, read from `location.state.from`.
 * Returns null for an unknown or missing origin (direct link, reload, search): the page then goes back to the managements list.
 */
export const saleBackLink=({state,accountId}:{state:unknown;accountId?:string|number|null}):{to:string;label:string}|null=>{
 const from=state&&typeof state==='object'&&'from' in state?(state as {from:unknown}).from:undefined;
 if(from==='my-day')return {to:'/my-day',label:'← Volver a Hoy'};
 if(from==='business'&&accountId)return {to:'/accounts/'+accountId,label:'← Volver al negocio'};
 return from==='opportunities'?{to:'/opportunities',label:'← Volver a Gestiones'}:null;
};
