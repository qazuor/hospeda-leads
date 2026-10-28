import {render,screen} from '@testing-library/react';
import {AutoOutcomeNote,canFixAutoOutcome} from './AutoOutcome';
import type {CommunicationView} from './types';

const view=(over:Partial<CommunicationView>={})=>({readOnly:false,canWrite:true,admin:false,...over}) as CommunicationView;

describe('AutoOutcomeNote',()=>{
 it('marks an outcome a response set as automatic',()=>{
  render(<AutoOutcomeNote message={{autoOutcomeResponseId:'r1',activityOutcome:'interested'}}/>);
  expect(screen.getByText('Respondió, le interesa · Resultado registrado automáticamente desde la respuesta')).toBeTruthy();
 });
 it('shows nothing for an outcome a person recorded or corrected',()=>{
  const {container}=render(<AutoOutcomeNote message={{autoOutcomeResponseId:null,activityOutcome:'interested'}}/>);
  expect(container.innerHTML).toBe('');
 });
});

describe('canFixAutoOutcome',()=>{
 it('lets a writer correct an automatic outcome',()=>{expect(canFixAutoOutcome(view(),{autoOutcomeResponseId:'r1',activityId:'7'})).toBe(true);});
 it('is off for read-only views, readers and outcomes that are not automatic',()=>{
  expect(canFixAutoOutcome(view({readOnly:true}),{autoOutcomeResponseId:'r1',activityId:'7'})).toBe(false);
  expect(canFixAutoOutcome(view({canWrite:false}),{autoOutcomeResponseId:'r1',activityId:'7'})).toBe(false);
  expect(canFixAutoOutcome(view(),{autoOutcomeResponseId:null,activityId:'7'})).toBe(false);
  expect(canFixAutoOutcome(view(),{autoOutcomeResponseId:'r1',activityId:null})).toBe(false);
 });
});
