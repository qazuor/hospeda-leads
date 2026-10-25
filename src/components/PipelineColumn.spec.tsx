import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {PipelineColumn} from './PipelineColumn';

afterEach(()=>{cleanup();vi.restoreAllMocks()});
const mount=(phoneLayout=false)=>render(<PipelineColumn columnKey="main:a" name="Por contactar" count={2} tone="slate" classification="Abierta" simple={false} phoneLayout={phoneLayout} phoneExpanded={false} onPhoneToggle={()=>{}}>contenido</PipelineColumn>);
describe('PipelineColumn',()=>{
 it('toggles the desktop collapse state and accessible label',()=>{mount();const button=screen.getByRole('button',{name:'Colapsar columna Por contactar'});expect(button.getAttribute('aria-expanded')).toBe('true');fireEvent.click(button);expect(screen.getByRole('button',{name:'Expandir columna Por contactar'}).getAttribute('aria-expanded')).toBe('false')});
 it('remains usable when localStorage throws',()=>{vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked')});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')});mount();fireEvent.click(screen.getByRole('button',{name:'Colapsar columna Por contactar'}));expect(screen.getByRole('button',{name:'Expandir columna Por contactar'})).toBeTruthy()});
 it('keeps a column collapsed on desktop reachable in the phone accordion',()=>{vi.spyOn(Storage.prototype,'getItem').mockReturnValue('true');const {container}=mount(true);const section=container.querySelector('section')!;expect(section.className).not.toMatch(/collapsed/);expect(screen.getByRole('heading',{name:/Por contactar/})).toBeTruthy();expect(screen.getByRole('button',{name:/Por contactar/}).getAttribute('aria-expanded')).toBe('false')});
});
