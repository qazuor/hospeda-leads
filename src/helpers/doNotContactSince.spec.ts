import {describe,it,expect} from 'vitest';
import {doNotContactSince,turnsDoNotContactOn} from './doNotContactSince';

const entry=(action:string,createdAt:string,metadata:unknown)=>({action,createdAt,metadata});

describe('doNotContactSince',()=>{
  it('reads the state trigger entry that turned the flag on, in camelCase or snake_case',()=>{
    expect(turnsDoNotContactOn(entry('contact_policy','2026-10-01T12:00:00Z',{before:{doNotContact:false,status:'in_management'},after:{doNotContact:true,status:'archived'},origin:'automatic'}))).toBe(true);
    expect(turnsDoNotContactOn(entry('contact_policy','2026-10-01T12:00:00Z',{before:{do_not_contact:false},after:{do_not_contact:true}}))).toBe(true);
  });
  it('reads the explicit admin contact policy entry',()=>{
    expect(turnsDoNotContactOn(entry('contact_policy','2026-10-01T12:00:00Z',{before:false,blocked:true,reason:'Pidió la baja'}))).toBe(true);
    expect(turnsDoNotContactOn(entry('contact_policy','2026-10-01T12:00:00Z',{before:true,blocked:true,reason:'Repetido'}))).toBe(false);
  });
  it('ignores entries that lift the flag, keep it unchanged or do not touch it',()=>{
    expect(turnsDoNotContactOn(entry('contact_policy','2026-10-01T12:00:00Z',{before:{doNotContact:true},after:{doNotContact:false}}))).toBe(false);
    expect(turnsDoNotContactOn(entry('account_updated','2026-10-01T12:00:00Z',{before:{doNotContact:true},after:{doNotContact:true,nombre:'Otro'}}))).toBe(false);
    expect(turnsDoNotContactOn(entry('business_status_changed','2026-10-01T12:00:00Z',{before:{status:'new'},after:{status:'archived'}}))).toBe(false);
    expect(turnsDoNotContactOn(entry('account_created','2026-10-01T12:00:00Z',null))).toBe(false);
  });
  it('returns the latest activation regardless of journal order',()=>{
    const journal=[
      entry('contact_policy','2026-09-01T12:00:00Z',{before:{doNotContact:false},after:{doNotContact:true}}),
      entry('contact_policy','2026-09-10T12:00:00Z',{before:{doNotContact:true},after:{doNotContact:false}}),
      entry('contact_policy','2026-10-05T12:00:00Z',{before:{doNotContact:false},after:{doNotContact:true}}),
      entry('account_updated','2026-10-06T12:00:00Z',{before:{nombre:'A'},after:{nombre:'B'}}),
    ];
    expect(doNotContactSince(journal)).toBe('2026-10-05T12:00:00Z');
    expect(doNotContactSince([...journal].reverse())).toBe('2026-10-05T12:00:00Z');
  });
  it('returns null when the journal does not show when it was marked',()=>{
    expect(doNotContactSince([])).toBeNull();
    expect(doNotContactSince([entry('account_created','2026-10-01T12:00:00Z',{})])).toBeNull();
  });
});
