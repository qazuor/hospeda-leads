import {managementStageCatalog} from '../helpers/businessManagement';
import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {StageStepper} from './StageStepper';

const renderStage=(stage:string|null|undefined,type:'main'|'partner'|'provider'|'editor'|'accompaniment'|null)=>render(<StageStepper stage={stage} type={type}/>);

describe('StageStepper',()=>{
 it('marks past, current and future steps for an open middle stage',()=>{const {container}=renderStage('partner:interest','partner');expect(screen.getByRole('img',{name:'Etapa 4 de 7: Interés confirmado'})).toBeTruthy();const steps=container.querySelectorAll('[title]');expect(steps).toHaveLength(7);expect(steps[2].getAttribute('class')).toContain('past');expect(steps[3].getAttribute('data-current')).toBe('true');expect(steps[4].getAttribute('class')).toContain('future');});
 it('marks the first open stage current',()=>{renderStage('partner:contact','partner');expect(screen.getByRole('img',{name:'Etapa 1 de 7: Por contactar'})).toBeTruthy();});
 it.each([['partner:won','partner','Cerrada ganada'],['partner:lost','partner','Cerrada perdida'],['provider:participates','provider','Participa'],['editor:collaborates','editor','Colabora'],['accompaniment:completed','accompaniment','Cerrada completada']] as const)('keeps the stage label for %s', (stage,type,label)=>{renderStage(stage,type);expect(screen.getByText('Etapa: '+label)).toBeTruthy();});
 it('uses a second path for editor stages after Colabora',()=>{renderStage('editor:proposal_sent','editor');expect(screen.getByRole('img',{name:'Etapa 2 de 3: Propuesta comercial enviada'})).toBeTruthy();});
 it('shows Leandro stages as a labeled pill',()=>{renderStage('partner:leandro','partner');expect(screen.getByText('Etapa: Derivada a Leandro')).toBeTruthy();expect(screen.queryByRole('img')).toBeNull();});
 it('falls back for a null type',()=>{renderStage('partner:contact','partner');renderStage('legacy stage',null);expect(screen.getByText('Etapa: legacy stage')).toBeTruthy();});
 it('falls back for an unknown stage in a known type',()=>{renderStage('unknown:stage','partner');expect(screen.getByText('Etapa: unknown:stage')).toBeTruthy();expect(screen.queryByText(/Etapa 0 de/)).toBeNull();});
 it('does not reorder the shared stage catalog',()=>{const before=managementStageCatalog('editor').map(item=>item.key);renderStage('editor:proposal_sent','editor');expect(managementStageCatalog('editor').map(item=>item.key)).toEqual(before);});
});
