import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {MantineProvider} from '@mantine/core';
import {HelpLink} from './HelpLink';
import {HELP_HINTS} from '../content/helpHints';

// Uses the real Popover: the trigger used to preventDefault, which made Mantine skip the toggle so the explanation never opened.
describe('HelpLink popover',()=>{
 beforeEach(()=>{window.matchMedia=vi.fn().mockReturnValue({matches:false,media:'',onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()});});
 it('opens the explanation on click and closes it from «Ver en la guía»',async()=>{
  render(<MantineProvider><MemoryRouter><HelpLink topic="businessTasks" hint="scheduleTask"/></MemoryRouter></MantineProvider>);
  expect(screen.queryByText(HELP_HINTS.scheduleTask)).toBeNull();
  fireEvent.click(screen.getByRole('link',{name:'Cómo funciona'}));
  expect(await screen.findByText(HELP_HINTS.scheduleTask)).toBeTruthy();
  fireEvent.click(screen.getByText('Ver en la guía'));
  await waitFor(()=>expect(screen.queryByText(HELP_HINTS.scheduleTask)).toBeNull());
 });
});
