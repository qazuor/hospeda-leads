import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {DueDateShortcuts,needsOverdueConfirmation} from './DueDateShortcuts';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
afterEach(cleanup);

// Friday 2026-10-23 in Argentina ("Lunes" and "En 3 días" coincide), a Wednesday where the four chips differ, and a Monday ("Lunes" and "En 1 semana" coincide).
const now=new Date('2026-10-23T15:00:00Z'),wednesday=new Date('2026-10-21T15:00:00Z'),monday=new Date('2026-10-26T15:00:00Z');
const setup=(props:Partial<Parameters<typeof DueDateShortcuts>[0]>={})=>{
 const onChange=vi.fn(),onConfirm=vi.fn();
 render(<MantineProvider><DueDateShortcuts label="Fecha de vencimiento" value="" onChange={onChange} overdueConfirmed={false} onOverdueConfirmedChange={onConfirm} now={now} {...props}/></MantineProvider>);
 return {onChange,onConfirm};
};

describe('DueDateShortcuts',()=>{
 it('offers the five choices and preselects none',()=>{
  setup({now:wednesday});
  for(const name of ['Mañana','En 3 días','Lunes','En 1 semana','Elegir fecha'])expect(screen.getByRole('button',{name}).getAttribute('aria-pressed')).toBe('false');
  expect((screen.getByLabelText('Fecha de vencimiento') as HTMLInputElement).value).toBe('');
 });

 it('maps each chip to its Argentina calendar day',()=>{
  const {onChange}=setup({now:wednesday});
  fireEvent.click(screen.getByRole('button',{name:'Mañana'}));
  fireEvent.click(screen.getByRole('button',{name:'En 3 días'}));
  fireEvent.click(screen.getByRole('button',{name:'Lunes'}));
  fireEvent.click(screen.getByRole('button',{name:'En 1 semana'}));
  expect(onChange.mock.calls.map(c=>c[0])).toEqual(['2026-10-22','2026-10-24','2026-10-26','2026-10-28']);
 });

 it('does not repeat a day: Friday drops "Lunes", Monday keeps "En 1 semana" and drops "Lunes"',()=>{
  setup();
  expect(screen.queryByRole('button',{name:'Lunes'})).toBeNull();
  expect(screen.getByRole('button',{name:'En 3 días'})).toBeTruthy();
  cleanup();
  setup({now:monday,value:'2026-11-02'});
  expect(screen.queryByRole('button',{name:'Lunes'})).toBeNull();
  expect(screen.getByRole('button',{name:'En 1 semana'}).getAttribute('aria-pressed')).toBe('true');
  // On a Monday exactly one day chip (and not "Elegir fecha") appears pressed.
  expect(screen.getAllByRole('button').filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.textContent)).toEqual(['En 1 semana']);
 });

 it('marks the matching chip as pressed and the custom one for other days',()=>{
  setup({value:'2026-10-24'});
  expect(screen.getByRole('button',{name:'Mañana'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button',{name:'Elegir fecha'}).getAttribute('aria-pressed')).toBe('false');
  cleanup();
  setup({value:'2026-12-01'});
  expect(screen.getByRole('button',{name:'Elegir fecha'}).getAttribute('aria-pressed')).toBe('true');
 });

 it('asks to confirm a past day before leaving it overdue',()=>{
  const {onConfirm}=setup({value:'2026-10-20'});
  const box=screen.getByRole('checkbox',{name:'Sí, quiero dejarla vencida'}) as HTMLInputElement;
  expect(box.required).toBe(true);
  fireEvent.click(box);
  expect(onConfirm).toHaveBeenCalledWith(true);
 });

 it('does not ask for today, the future or the unchanged original day',()=>{
  expect(needsOverdueConfirmation('2026-10-23',undefined,now)).toBe(false);
  expect(needsOverdueConfirmation('2026-10-24',undefined,now)).toBe(false);
  expect(needsOverdueConfirmation('',undefined,now)).toBe(false);
  expect(needsOverdueConfirmation('2026-10-20','2026-10-20',now)).toBe(false);
  expect(needsOverdueConfirmation('2026-10-20','2026-10-21',now)).toBe(true);
 });

 it('labels the chips as postponing when editing',()=>{
  setup({postpone:true});
  expect(screen.getByText('Posponer a:')).toBeTruthy();
 });

 it('resets the confirmation whenever the day changes',()=>{
  const {onChange,onConfirm}=setup({value:'2026-10-20',overdueConfirmed:true});
  fireEvent.click(screen.getByRole('button',{name:'Mañana'}));
  expect(onChange).toHaveBeenCalledWith('2026-10-24');
  expect(onConfirm).toHaveBeenLastCalledWith(false);
 });
});
