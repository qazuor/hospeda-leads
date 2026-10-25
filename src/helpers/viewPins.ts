export interface ViewPinConfig{order:string[];hidden:string[]}
export interface PinView{key:string;name:string;kind:string}
export const systemViewKey=(id:string)=>`system:${id}`;
export const quickViewKey=(key:string)=>`quick:${key}`;
export const personalViewKey=(id:string)=>`personal:${id}`;
export function resolveViewPins<T extends PinView>(views:T[],config?:ViewPinConfig|null,allKey?:string):{pinned:T[];unpinned:T[]}{
 const available=new Map(views.map(view=>[view.key,view]));
 if(!config)return {pinned:views,unpinned:[]};
 const hidden=new Set(config.hidden.filter(key=>key!==allKey&&available.has(key)));
 const ordered=config.order.map(key=>available.get(key)).filter((view):view is T=>!!view&&!hidden.has(view.key));
 const used=new Set(ordered.map(view=>view.key));
 const pinned=[...ordered,...views.filter(view=>!hidden.has(view.key)&&!used.has(view.key))];
 return {pinned,unpinned:views.filter(view=>hidden.has(view.key))};
}
