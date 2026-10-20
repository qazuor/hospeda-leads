import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {HelpHint} from './HelpHint';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
afterEach(cleanup);

describe('HelpHint',()=>{
 it('opens the glossary definition from an accessible trigger',async()=>{
  render(<MantineProvider><HelpHint term="stage"/></MantineProvider>);
  const trigger=screen.getByRole('button',{name:'¿Qué es Etapa?'});
  expect(trigger.textContent).toContain('¿Qué es esto?');
  fireEvent.click(trigger);
  expect(await screen.findByText(/cada gestión tiene su Etapa/)).toBeTruthy();
  fireEvent.keyDown(trigger,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByText(/cada gestión tiene su Etapa/)).toBeNull());
 });

 it('can render only the icon',()=>{
  render(<MantineProvider><HelpHint term="doNotContact" iconOnly/></MantineProvider>);
  const trigger=screen.getByRole('button',{name:'¿Qué es No contactar?'});
  expect(trigger.textContent).not.toContain('¿Qué es esto?');
 });
});
