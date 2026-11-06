import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MantineProvider} from '@mantine/core';
import {BulkChangeReview} from './BulkChangeReview';

vi.mock('../endpoints/leads_bulk_POST.schema',()=>({postLeadsBulk:vi.fn(async()=>({preview:{businesses:[{id:'184',nombre:'Tierra Linda',ciudad:'Colón',assignedUserEmail:'ana@example.com',linked:true,linkedTo:'73'}],rows:[],fingerprint:'preview-1'}}))}));
afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation((media:string)=>({matches:false,media,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
it('marks a group member added by the bulk preview as linked to the selected business',async()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<MantineProvider><QueryClientProvider client={client}><BulkChangeReview input={{entity:'business',ids:['73'],changes:{assignedUserEmail:'ana@example.com'}} as never} onClose={()=>{}} onConfirm={()=>{}} pending={false}/></QueryClientProvider></MantineProvider>);expect(await screen.findByText('Tierra Linda · vinculado a H73')).toBeTruthy();});
