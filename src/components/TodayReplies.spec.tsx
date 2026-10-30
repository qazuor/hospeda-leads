import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {TodayReplies} from './TodayReplies';
import type {InboundReview} from '../endpoints/communication.schema';
const row:InboundReview={id:'r1',accountId:'42',accountName:'Hotel Sol',leadId:null,channel:'whatsapp',receivedAt:new Date(Date.now()-60000),fromName:'Ana',fromAddress:'ana@example.com',subject:'Consulta',textBody:'Hola'};
describe('TodayReplies',()=>{
 it('renders the account link, channel and relative time',()=>{render(<MemoryRouter><TodayReplies rows={[row]}/></MemoryRouter>);expect(screen.getByRole('link',{name:'Hotel Sol'}).getAttribute('href')).toBe('/accounts/42?tab=comunicacion');expect(document.querySelector('[data-channel="whatsapp"] svg')).toBeTruthy();expect(screen.getByText('hoy')).toBeTruthy();});
});
