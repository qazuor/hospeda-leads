import {render,screen} from '@testing-library/react';
import {vi} from 'vitest';
vi.mock('./Tooltip',()=>({Tooltip:({children}: {children:React.ReactNode})=><>{children}</>,TooltipTrigger:({children}: {children:React.ReactNode})=><>{children}</>,TooltipContent:()=>null}));
import {MemoryRouter} from 'react-router-dom';
import {HelpLink} from './HelpLink';

describe('HelpLink',()=>{
 it('routes each contextual topic to its guide article anchor',()=>{
  render(<MemoryRouter><HelpLink topic="inbox"/></MemoryRouter>);
  expect(screen.getByRole('link',{name:'Cómo funciona'}).getAttribute('href')).toBe('/guide#inbox-overview');
 });
});
