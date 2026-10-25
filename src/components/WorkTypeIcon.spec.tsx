import {render,screen} from '@testing-library/react';
import {WorkTypeIcon} from './WorkTypeIcon';
import type {WorkData} from '../endpoints/work.schema';
const data={types:[{id:'call',name:'Llamada',agenda:true,active:true},{id:'message',name:'Mensaje',agenda:false,active:true},{id:'visit',name:'Visita',agenda:true,active:true},{id:'meeting',name:'Reunión',agenda:true,active:true},{id:'followup',name:'Seguimiento',agenda:false,active:true},{id:'proposal',name:'Propuesta',agenda:false,active:true}]} as WorkData;
describe('WorkTypeIcon',()=>{
 it('maps types to their requested tones',()=>{for(const [id,tone] of [['call','blue'],['message','violet'],['visit','green'],['meeting','orange'],['followup','sky'],['proposal','slate'],['unknown','slate']]){const {container,unmount}=render(<WorkTypeIcon typeId={id} data={data}/>);expect(container.querySelector('[data-tone="'+tone+'"]')).toBeTruthy();unmount();}});
 it('renders the catalog type name for assistive technology',()=>{render(<WorkTypeIcon typeId="call" data={data}/>);expect(screen.getByText('Llamada')).toBeTruthy();});
});
