import {USERSCRIPT_MISSING_REASON,USERSCRIPT_NO_TOKEN_REASON,USERSCRIPT_REJECTED_REASON,USERSCRIPT_UNVERIFIED_REASON,USERSCRIPT_VERIFYING_REASON,USERSCRIPT_WAITING_REASON,userscriptContactBlock,type UserscriptStatus} from './userscriptGate';

const me='ana@hospeda.test';
const block=(status:Partial<UserscriptStatus>,{mobile=false,currentUserEmail=me as string|null}={})=>userscriptContactBlock({mobile,latest:'1.5.0',currentUserEmail,status:{version:'1.5.0',connection:'connected',user:me,...status}});

describe('userscriptContactBlock',()=>{
 it('lets a connected, current script of the same user through',()=>{expect(block({})).toBe('');expect(block({user:'ANA@hospeda.test '})).toBe('');});
 it('waits while the script has not announced itself',()=>{expect(block({version:undefined})).toBe(USERSCRIPT_WAITING_REASON);});
 it('blocks as verifying while the version is announced but the connection is not yet',()=>{expect(block({connection:undefined,user:null})).toBe(USERSCRIPT_VERIFYING_REASON);expect(block({connection:'unknown',user:null})).toBe(USERSCRIPT_UNVERIFIED_REASON);expect(block({connection:null,user:null})).toBe(USERSCRIPT_UNVERIFIED_REASON);});
 it('asks to install it when it was not detected',()=>{expect(block({version:null,connection:null,user:null})).toBe(USERSCRIPT_MISSING_REASON);});
 it('blocks any version below the latest one',()=>{
  expect(block({version:'1.4.0'})).toBe('Actualizá el script (tenés 1.4.0, la actual es 1.5.0).');
  expect(block({version:'1.4.9',connection:null,user:null})).toBe('Actualizá el script (tenés 1.4.9, la actual es 1.5.0).');
  expect(block({version:'garbage'})).toBe('Actualizá el script (tenés garbage, la actual es 1.5.0).');
  expect(block({version:'1.10.0'})).toBe('');
 });
 it('uses the version text when the CRM refuses the script version',()=>{expect(block({connection:'outdated',user:null})).toBe('Actualizá el script (tenés 1.5.0, la actual es 1.5.0).');});
 it('explains a missing or rejected token',()=>{expect(block({connection:'missing-token',user:null})).toBe(USERSCRIPT_NO_TOKEN_REASON);expect(block({connection:'rejected',user:null})).toBe(USERSCRIPT_REJECTED_REASON);});
 it('cannot verify an unknown connection, a missing attribute or a connection without user',()=>{
  expect(block({connection:'unknown',user:null})).toBe(USERSCRIPT_UNVERIFIED_REASON);
  expect(block({connection:null,user:null})).toBe(USERSCRIPT_UNVERIFIED_REASON);
  expect(block({connection:'connected',user:null})).toBe(USERSCRIPT_UNVERIFIED_REASON);
 });
 it('blocks a token of another CRM user and names it',()=>{expect(block({user:'otra@hospeda.test'})).toBe('El script está conectado con otra cuenta (otra@hospeda.test). Reconectalo con la tuya.');});
 it('never blocks phones and tablets',()=>{for(const status of [{version:null},{version:'1.4.0'},{connection:'rejected'},{user:'otra@hospeda.test'},{version:undefined}] as Partial<UserscriptStatus>[])expect(block(status,{mobile:true})).toBe('');});
});
