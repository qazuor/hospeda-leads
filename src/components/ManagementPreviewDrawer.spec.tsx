import {beforeAll,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import type {Opportunity} from '../endpoints/commercial.schema';
import type {PipelineData,PipelineInsight,PipelineStage} from '../endpoints/pipeline.schema';
import {ManagementPreviewDrawer} from './ManagementPreviewDrawer';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(()=>({matches:false,media:'',addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}))});
const lead={id:1,accountId:2,nombre:'Hotel Sol',opportunityName:'Publicación anual',managementType:'main',estado:'main:contact',tipo:'Hotel',assignedUserEmail:'ana@example.com',prioridad:null,fechaUltimoContacto:null,fechaProximaAccion:null} as unknown as Opportunity;
const data={users:[{email:'ana@example.com',displayName:'Ana Pérez'}],stages:[{name:'main:contact',classification:'open',managementType:'main'}]} as unknown as PipelineData;
const insight={id:'1',canModify:false,pendingFollowup:true,stageSince:null,manualPriority:null} as PipelineInsight;
const renderDrawer=(onOpen=vi.fn())=>render(<MantineProvider><ManagementPreviewDrawer lead={lead} insight={insight} data={data} stage={data.stages[0] as PipelineStage} role="seller" opened onClose={()=>{}} onOpen={onOpen} onChangeStage={()=>{}} returnFocusTo={null}/></MantineProvider>);
describe('ManagementPreviewDrawer',()=>{
 it('renders the board fields, empty contact and no next step',()=>{renderDrawer();expect(screen.getByText('Vista previa de la gestión')).toBeTruthy();expect(screen.getByText('Hotel Sol · Verticales principales')).toBeTruthy();expect(screen.getByText('Ana Pérez')).toBeTruthy();expect(screen.getByText('Sin contacto registrado')).toBeTruthy();expect(screen.getByText('Sin prioridad manual')).toBeTruthy();expect(screen.queryByText('Próximo paso')).toBeNull()});
 it('opens the management from its primary action',()=>{const onOpen=vi.fn();renderDrawer(onOpen);fireEvent.click(screen.getByRole('button',{name:'Abrir gestión'}));expect(onOpen).toHaveBeenCalledWith(lead)});
 it('keeps stage changes disabled and explains why',async()=>{renderDrawer();const button=screen.getByRole('button',{name:'Cambiar etapa'});expect(button.hasAttribute('disabled')).toBe(true);fireEvent.mouseEnter(button.parentElement as HTMLElement);expect(await screen.findByText('Solo Ana Pérez o un administrador puede cambiar la etapa.')).toBeTruthy()});
});
