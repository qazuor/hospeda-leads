import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MissingCommercialProfileNotice} from './MissingCommercialProfileNotice';

afterEach(cleanup);
describe('MissingCommercialProfileNotice',()=>{
 it('shows a non-blocking notice when the profile is missing',()=>{
  render(<MissingCommercialProfileNotice commercialProfile={null}/>);
  expect(screen.getByRole('note').textContent).toContain('no tiene perfil comercial');
 });
 it('hides the notice when a profile exists',()=>{
  const {container}=render(<MissingCommercialProfileNotice commercialProfile="Referente"/>);
  expect(container.childElementCount).toBe(0);
 });
});
