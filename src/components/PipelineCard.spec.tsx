import {beforeAll,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {PipelineCard} from './PipelineCard';
import type {PipelineData} from '../endpoints/pipeline.schema';
import type {Opportunity} from '../endpoints/commercial.schema';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}))});

const lead={id:1,accountId:9,nombre:'Hotel Sol',estado:'main:contact',managementType:'main',assignedUserEmail:'ana@example.com',prioridad:null,tipo:'Hotel',opportunityName:'Alta',fechaProximaAccion:'2026-10-24'} as unknown as Opportunity;
const data={users:[{email:'ana@example.com',displayName:'Ana'}]} as PipelineData;
const renderCard=(onOpen=vi.fn(),extra:{fechaProximaAccion?:string}={})=>render(<MantineProvider><PipelineCard lead={{...lead,...extra} as Opportunity} insight={{id:'1',canModify:false,pendingFollowup:true,stageSince:null} as never} data={data} stage={{name:'main:contact',classification:'open',managementType:'main'} as never} role="seller" simple={false} now={new Date('2026-10-25T15:00:00Z')} onOpen={onOpen} onPreview={()=>{}} onChangeStage={()=>{}}/></MantineProvider>);
describe('PipelineCard',()=>{
 it('opens the management by its name and shows the disabled stage reason',async()=>{const onOpen=vi.fn();renderCard(onOpen);fireEvent.click(screen.getByRole('button',{name:'Alta'}));expect(onOpen).toHaveBeenCalledWith(lead);const button=screen.getByRole('button',{name:'Cambiar etapa'});expect(button.hasAttribute('disabled')).toBe(true);fireEvent.focus(button.parentElement as HTMLElement);expect(await screen.findByText('Solo Ana o un administrador puede cambiar la etapa.')).toBeTruthy()});
 it('colours overdue and today dates in Argentina calendar days',()=>{const {container}=renderCard();expect(container.querySelector('[class*="overdue"]')).toBeTruthy();const {container:today}=renderCard(vi.fn(),{fechaProximaAccion:'2026-10-25'});expect(today.querySelector('[class*="today"]')).toBeTruthy()});
});
