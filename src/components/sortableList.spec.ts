import {describe,it,expect} from 'vitest';
import {dropIndicatorPosition,reorderItems,reorderWithinZone,restrictToList} from './sortableList';
describe('sortable list helpers',()=>{
 it('reorders only known distinct items',()=>{expect(reorderItems(['a','b','c'],'a','c')).toEqual(['b','c','a']);expect(reorderItems(['a','b'],'x','b')).toEqual(['a','b']);});
 it('reorders visible items without crossing zone boundaries',()=>{expect(reorderWithinZone(['left','a','b','right'],['a','b'],'b','a')).toEqual(['left','b','a','right']);expect(reorderWithinZone(['left','a','right'],['left'],'left','a')).toEqual(['left','a','right']);});
 it('marks drop position relative to the active row',()=>{expect(dropIndicatorPosition(['a','b','c'],'a','c')).toEqual({key:'a',position:'bottom'});expect(dropIndicatorPosition(['a','b'],'b','a')).toEqual({key:'b',position:'top'});});
 it('clamps movement to list bounds',()=>{const element=document.createElement('div');element.getBoundingClientRect=()=>({top:10,bottom:100,left:0,right:0,width:0,height:90,x:0,y:10,toJSON(){}});const modifier=restrictToList(()=>element);const result=modifier({transform:{x:2,y:200,scaleX:1,scaleY:1},activeNodeRect:{top:20,bottom:40,left:0,right:1,width:1,height:20},containerNodeRect:null,scrollableAncestors:[],scrollableAncestorRects:[]} as never);expect(result.y).toBe(60);});
});
