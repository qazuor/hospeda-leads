import {render,screen} from '@testing-library/react';
import {vi} from 'vitest';
vi.mock('./Popover',()=>({Popover:({children}: {children:React.ReactNode})=><>{children}</>,PopoverTrigger:({children}: {children:React.ReactNode})=><>{children}</>,PopoverContent:({children}: {children:React.ReactNode})=><div>{children}</div>}));
import {MemoryRouter} from 'react-router-dom';
import {HelpLink} from './HelpLink';
import {HELP_HINTS} from '../content/helpHints';
import {MantineProvider} from '@mantine/core';

const wrap=(ui:React.ReactNode)=>render(<MantineProvider><MemoryRouter>{ui}</MemoryRouter></MantineProvider>);
describe('HelpLink',()=>{
 beforeEach(()=>{window.matchMedia=vi.fn().mockReturnValue({matches:false,media:'',onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()});});
 it('routes each contextual topic to its guide article anchor',()=>{
  wrap(<HelpLink topic="inbox"/>);
  expect(screen.getByRole('link',{name:'Cómo funciona'}).getAttribute('href')).toBe('/guide#inbox-overview');
 });
 it('falls back to the topic text when no placement hint is given',()=>{
  wrap(<HelpLink topic="businesses"/>);
  expect(screen.getByText(HELP_HINTS.businesses)).toBeTruthy();
 });
 it('shows different text per placement while keeping the same guide link',()=>{
  wrap(<><HelpLink topic="businessTasks" hint="scheduleTask"/><HelpLink topic="logResult" hint="logWhatHappened"/></>);
  expect(screen.getByText(HELP_HINTS.scheduleTask)).toBeTruthy();
  expect(screen.getByText(HELP_HINTS.logWhatHappened)).toBeTruthy();
  expect(HELP_HINTS.scheduleTask).not.toBe(HELP_HINTS.logWhatHappened);
  expect(screen.getAllByRole('link',{name:'Ver en la guía'}).map(a=>a.getAttribute('href'))).toEqual(['/guide#plan','/guide#record']);
 });
 it('keeps one distinct, non-empty text per hint key',()=>{
  const texts=Object.values(HELP_HINTS);
  expect(texts.every(text=>text.trim().length>20)).toBe(true);
  expect(new Set(texts).size).toBe(texts.length);
 });
});
