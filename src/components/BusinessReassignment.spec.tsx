import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReassignmentPlan} from '../helpers/businessReassignment';

const {getPreview,execute}=vi.hoisted(()=>({getPreview:vi.fn(),execute:vi.fn()}));
vi.mock('../endpoints/business_reassignment.schema',()=>({getBusinessReassignmentPreview:getPreview,executeBusinessReassignment:execute}));
import {BusinessReassignment} from './BusinessReassignment';

const plan:ReassignmentPlan={fingerprint:'a'.repeat(64),eligibleCount:2,moves:[],unassignedLocked:0,users:[],groups:[{groupId:'10',accountIds:['73','184'],toEmail:'ana@example.com',kind:'together'},{groupId:'11',accountIds:['2065','2070'],toEmail:null,kind:'conflict'}]};
const setup=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BusinessReassignment/></QueryClientProvider></MantineProvider>);
beforeEach(()=>{getPreview.mockResolvedValue(plan);execute.mockReset();});afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));});

describe('BusinessReassignment linked groups',()=>{
 it('shows groups moving together and links conflicting accounts to their business records',async()=>{
  setup();
  expect(await screen.findByText('Negocios vinculados')).toBeTruthy();
  expect(screen.getByText('1 grupos se mueven juntos')).toBeTruthy();
  expect(screen.getByText(/H73 \+ H184/)).toBeTruthy();
  expect(screen.getByRole('link',{name:'H2065'}).getAttribute('href')).toBe('/accounts/2065');
  expect(screen.getByRole('link',{name:'H2070'}).getAttribute('href')).toBe('/accounts/2070');
  expect(screen.getByText('Grupos en conflicto (no se mueven)')).toBeTruthy();
 });
 it('hides the group section when the plan contains no linked accounts',async()=>{
  getPreview.mockResolvedValue({...plan,groups:[]});setup();
  await screen.findByText('2 negocios nuevos');
  expect(screen.queryByText('Negocios vinculados')).toBeNull();
 });
});
