import {canonicalVertical} from './verticalColors';
/** Spec 102 D3: how a material relates to the vertical of the context (management, else business). `all`: it has no verticals (applies to every one). */
export type SalesMaterialVerticalMatch='specific'|'all'|'other';
const RANK:Record<SalesMaterialVerticalMatch,number>={specific:0,all:1,other:2};
/** The match of one material for `vertical`, or null without a known context vertical. Same aliases as message models ({@link canonicalVertical}). */
export function salesMaterialVerticalMatch({verticals,vertical}:{verticals:readonly string[];vertical:string|null|undefined}):SalesMaterialVerticalMatch|null{
 const context=vertical?.trim();if(!context)return null;
 if(!verticals.length)return 'all';
 const key=canonicalVertical(context);
 return verticals.some(v=>canonicalVertical(v)===key)?'specific':'other';
}
/**
 * Spec 102 D3/D5: the list ordered for the seller: materials of the context vertical first, then the «all verticals» ones, then the rest, each
 * group in its original order. Without a vertical, the original order with `verticalMatch:null`. Nothing is ever dropped: the picker folds «other».
 */
export function salesMaterialRelevance<T extends {verticals:readonly string[]}>({materials,vertical}:{materials:readonly T[];vertical:string|null|undefined}):(T&{verticalMatch:SalesMaterialVerticalMatch|null})[]{
 const tagged=materials.map((m,i)=>({m:{...m,verticalMatch:salesMaterialVerticalMatch({verticals:m.verticals,vertical})},i}));
 return tagged.sort((a,b)=>(a.m.verticalMatch?RANK[a.m.verticalMatch]:0)-(b.m.verticalMatch?RANK[b.m.verticalMatch]:0)||a.i-b.i).map(t=>t.m);
}
