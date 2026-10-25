import {describe,expect,it} from 'vitest';
import {render,screen} from '@testing-library/react';
import {BusinessLastContactCell} from './BusinessLastContactCell';

describe('BusinessLastContactCell',()=>{
 it('shows the date and accessible age tone bar',()=>{
  const {container}=render(<BusinessLastContactCell value="2026-10-24"/>);
  expect(screen.getByText('24 de oct de 2026',{exact:true})).toBeTruthy();
  expect(container.querySelector('[aria-hidden="true"] [data-tone]')).toBeTruthy();
 });
});
