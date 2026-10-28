import {MantineProvider} from '@mantine/core';
import {fireEvent,render,screen} from '@testing-library/react';
import {LAYERS} from '../helpers/layers';
import {MultiSelect} from './MultiSelect';

describe('MultiSelect',()=>{
 beforeAll(()=>{window.ResizeObserver??=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;Element.prototype.scrollIntoView??=()=>{};window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
 it('opens its options above dialogs (owner review: the categories list opened behind «Nuevo material»)',()=>{
  // Arrange
  render(<MantineProvider><MultiSelect label="Categorías" data={[{value:'1',label:'Folletos'}]} value={[]} onChange={()=>{}}/></MantineProvider>);
  // Act
  fireEvent.click(screen.getAllByLabelText('Categorías').find(e=>e.tagName==='INPUT')!);
  // Assert
  const dropdown=screen.getByRole('listbox',{hidden:true}).closest('.mantine-Popover-dropdown') as HTMLElement;
  expect(Number(dropdown.style.zIndex)).toBe(LAYERS.combobox);
  expect(LAYERS.combobox).toBeGreaterThan(LAYERS.dialogBase);
 });
});
