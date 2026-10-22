import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {InlineBusinessReview} from './InlineBusinessReview';

const mocks=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('../endpoints/commercial.schema',()=>({saveCommercial:mocks.save}));
vi.mock('../helpers/crmFeedback',()=>({crmSuccess:vi.fn()}));
vi.mock('./Popover',async()=>{const React=await import('react');const Context=React.createContext<{open:boolean;change:(value:boolean)=>void}>({open:false,change:()=>{}});return {Popover:({open,children,onOpenChange}:{open:boolean;children:React.ReactNode;onOpenChange:(value:boolean)=>void})=> <Context.Provider value={{open,change:onOpenChange}}>{children}</Context.Provider>,PopoverTrigger:({children}:{children:React.ReactElement<{onClick?:()=>void;'aria-expanded'?:boolean}>})=>{const context=React.useContext(Context);return React.cloneElement(children,{onClick:()=>context.change(!context.open),'aria-expanded':context.open});},PopoverContent:({children,...props}:{children:React.ReactNode;"aria-label"?:string;className?:string;align?:string})=>{const context=React.useContext(Context);return context.open?<div role="dialog" {...props}>{children}</div>:null;}};});

const wrap=(status:'new'|'reviewed'|'in_management'|'archived',disabled=false)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><InlineBusinessReview accountId="1" name="Hotel Río" status={status} disabled={disabled}/></QueryClientProvider></MantineProvider>);
beforeEach(()=>mocks.save.mockReset().mockResolvedValue({}));
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
afterEach(cleanup);

describe('InlineBusinessReview',()=>{
 it('shows the two review options and saves the selected status',async()=>{
  wrap('new');fireEvent.click(screen.getByRole('button',{name:'Editar revisión de Hotel Río. Ahora: No revisado'}));fireEvent.click(await screen.findByRole('button',{name:'Revisado'}));
  await waitFor(()=>expect(mocks.save.mock.calls[0]?.[0]).toEqual({action:'business_status',accountId:'1',status:'reviewed',recontactAt:null}));
 });
 it('does not send a request for the current value',()=>{
  wrap('reviewed');fireEvent.click(screen.getByRole('button',{name:'Editar revisión de Hotel Río. Ahora: Revisado'}));expect(screen.getAllByRole('button').find(button=>button.getAttribute('aria-pressed')==='true')?.hasAttribute('disabled')).toBe(true);expect(mocks.save).not.toHaveBeenCalled();
 });
 it.each(['in_management','archived'] as const)('disables review options for %s',status=>{
  wrap(status);fireEvent.click(screen.getByRole('button',{name:/Editar revisión/}));expect(screen.getAllByRole('button').filter(button=>button.hasAttribute('disabled'))).toHaveLength(2);expect(mocks.save).not.toHaveBeenCalled();
 });
 it('explains why No contactar disables the options',async()=>{
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}><InlineBusinessReview accountId="1" name="Hotel Río" status="reviewed" doNotContact/></QueryClientProvider></MantineProvider>);fireEvent.click(screen.getByRole('button',{name:/Editar revisión/}));const disabled=screen.getAllByRole('button').find(button=>button.hasAttribute('disabled'))!;fireEvent.mouseEnter(disabled.parentElement!);expect(await screen.findByText(/marcado como No contactar/)).toBeTruthy();
 });
 it('keeps the badge read-only when the row cannot be modified',()=>{
  wrap('new',true);expect(screen.getByText('No revisado')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();
 });
});
