import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {ListQuickFilters} from './ListQuickFilters';
import {localDay} from '../helpers/workDates';
afterEach(cleanup);
beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
describe('ListQuickFilters',()=>{it('builds a non-business category and overdue preset on the Argentina day',async()=>{const today=localDay(),onChange=vi.fn();render(<MantineProvider><ListQuickFilters groups={[]} fields={[{key:'estado',options:[{value:'main:contact',label:'Por contactar'}]}]} categories={[{field:'estado',label:'Etapa'}]} date={{field:'fechaProximaAccion',label:'Próximo paso',presets:[{key:'overdue',label:'Vencidas',build:field=>[{field,operator:'before',value:localDay()}]}]}} onChange={onChange}/></MantineProvider>);expect(screen.getByRole('button',{name:'Etapa'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Próximo paso'}));fireEvent.click(await screen.findByRole('button',{name:'Vencidas'}));expect(onChange).toHaveBeenCalledWith([{rules:[{field:'fechaProximaAccion',operator:'before',value:today}]}]);});});
