import {arrayMove} from '@dnd-kit/sortable';
import type {Modifier} from '@dnd-kit/core';

export function reorderItems<T extends string>(items:T[],active:T,over:T|null):T[]{if(!over||active===over)return items;const from=items.indexOf(active),to=items.indexOf(over);return from<0||to<0?items:arrayMove(items,from,to);}
export function reorderWithinZone<T extends string>(columns:T[],zoneItems:T[],active:T,over:T|null):T[]{const ordered=reorderItems(zoneItems,active,over);if(ordered===zoneItems)return columns;let cursor=0;return columns.map(item=>zoneItems.includes(item)?ordered[cursor++]:item);}
export function dropIndicatorPosition<T extends string>(items:T[],active:T,over:T|null){if(!over||active===over)return null;const from=items.indexOf(active),to=items.indexOf(over);if(from<0||to<0)return null;return {key:active,position:from<to?'bottom' as const:'top' as const};}
export function restrictToList(getElement:()=>HTMLElement|null):Modifier{return ({transform,activeNodeRect})=>{const element=getElement();if(!element||!activeNodeRect)return transform;const bounds=element.getBoundingClientRect(),min=bounds.top-activeNodeRect.top,max=bounds.bottom-activeNodeRect.bottom;return {...transform,y:Math.max(min,Math.min(max,transform.y))};};}
