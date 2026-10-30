import {describe,expect,it} from 'vitest';
import {stageChangeToSend} from './stageSuggestion';
const accepted={leadId:'7',stage:'main:interested',revision:4};
describe('stageChangeToSend',()=>{
 it('sends the revision captured when the box was ticked',()=>{expect(stageChangeToSend({accepted,suggestedKey:'main:interested',leadId:'7'})).toEqual({stage:'main:interested',revision:4});});
 it('sends nothing when nothing was ticked',()=>{expect(stageChangeToSend({accepted:null,suggestedKey:'main:interested',leadId:'7'})).toBeUndefined();});
 it('drops the tick when another management is selected',()=>{expect(stageChangeToSend({accepted,suggestedKey:'main:interested',leadId:'8'})).toBeUndefined();});
 it('drops the tick when the suggestion changed or disappeared',()=>{expect(stageChangeToSend({accepted,suggestedKey:'main:contacted',leadId:'7'})).toBeUndefined();expect(stageChangeToSend({accepted,suggestedKey:null,leadId:'7'})).toBeUndefined();});
});
