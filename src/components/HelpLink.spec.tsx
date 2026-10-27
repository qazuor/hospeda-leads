import {render,screen} from '@testing-library/react';
import {vi} from 'vitest';
vi.mock('./Popover',()=>({Popover:({children}: {children:React.ReactNode})=><>{children}</>,PopoverTrigger:({children}: {children:React.ReactNode})=><>{children}</>,PopoverContent:()=>null}));
import {MemoryRouter} from 'react-router-dom';
import {HelpLink} from './HelpLink';
import {MantineProvider} from '@mantine/core';

describe('HelpLink',()=>{
 it('routes each contextual topic to its guide article anchor',()=>{
  window.matchMedia=vi.fn().mockReturnValue({matches:false,media:'',onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()});
  render(<MantineProvider><MemoryRouter><HelpLink topic="inbox"/></MemoryRouter></MantineProvider>);
  expect(screen.getByRole('link',{name:'Cómo funciona'}).getAttribute('href')).toBe('/guide#inbox-overview');
 });
});
