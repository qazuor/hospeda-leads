import React from 'react';
import {beforeAll,describe,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';

vi.mock('./Tooltip',()=>({Tooltip:({children}:{children:React.ReactNode})=><div>{children}</div>,TooltipTrigger:({children}:{children:React.ReactNode})=><>{children}</>,TooltipContent:({children}:{children:React.ReactNode})=><span data-testid="classification-tooltip">{children}</span>}));
import {BusinessClassificationBadges} from './BusinessClassificationBadges';

beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});

describe('BusinessClassificationBadges',()=>{
 it('renders one colored vertical and subtype badge for every panel pair',()=>{
  render(<MantineProvider><BusinessClassificationBadges classifications={[{tipo:'Alojamiento',subtipo:'Hotel'},{tipo:'Gastronomía',subtipo:'Restaurante'}]}/></MantineProvider>);
  for(const label of ['Alojamiento','Hotel','Gastronomía','Restaurante'])expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByTestId('classification-tooltip').textContent).toBe('Alojamiento · Hotel, Gastronomía · Restaurante');
 });
 it('shows the display pair and accurate +N with every list classification in its tooltip',()=>{
  render(<MantineProvider><BusinessClassificationBadges compact verticals={['Hotel','Gastronomía']} subtypes={['Restaurante']} displayPair={{tipo:'Hotel',subtipo:'Hotel boutique'}}/></MantineProvider>);
  expect(screen.getByText('Hotel boutique')).toBeTruthy();expect(screen.getByText('+1')).toBeTruthy();
  expect(screen.getByTestId('classification-tooltip').textContent).toBe('Hotel · Gastronomía · Restaurante');
 });
 it('renders all list vertical and subtype badges in card mode',()=>{
  render(<MantineProvider><BusinessClassificationBadges verticals={['Hotel','Gastronomía']} subtypes={['Hotel boutique','Restaurante']}/></MantineProvider>);
  for(const label of ['Hotel','Gastronomía','Hotel boutique','Restaurante'])expect(screen.getByText(label)).toBeTruthy();
 });
});
