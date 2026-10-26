import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter,useLocation} from 'react-router-dom';
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{role:'user'}}})}));
import GuidePage from './guide';

function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname+location.hash}</output>}
afterEach(cleanup);
beforeEach(()=>{window.matchMedia??=((query:string)=>({matches:false,media:query,onchange:null,addListener:()=>undefined,removeListener:()=>undefined,addEventListener:()=>undefined,removeEventListener:()=>undefined,dispatchEvent:()=>false})) as typeof window.matchMedia});

describe('Guide page article selection',()=>{
 it('keeps the selected article when returning to the topic list',()=>{
  const scroll=vi.fn();HTMLElement.prototype.scrollIntoView=scroll;
  render(<MantineProvider><MemoryRouter initialEntries={['/guide#routine']}><><GuidePage/><LocationProbe/></></MemoryRouter></MantineProvider>);
  const selected=document.getElementById('guide-article-title')?.textContent;
  fireEvent.click(screen.getByRole('button',{name:'Ver los temas de la guía'}));
  expect(document.getElementById('guide-article-title')?.textContent).toBe(selected);
  expect(screen.getByTestId('location').textContent).toBe('/guide#routine');
  expect(scroll).toHaveBeenCalled();
 });
});
