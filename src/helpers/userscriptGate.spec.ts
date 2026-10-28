import {USERSCRIPT_MISSING_REASON,USERSCRIPT_NO_TOKEN_REASON,USERSCRIPT_REJECTED_REASON,USERSCRIPT_UNVERIFIED_REASON,USERSCRIPT_VERIFYING_REASON,USERSCRIPT_WAITING_REASON,userscriptContactBlock,userscriptPrompt,type UserscriptStatus} from './userscriptGate';

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

describe('userscriptPrompt (owner review of spec 96)',()=>{
 const prompt=(status:Partial<UserscriptStatus>,{mobile=false,currentUserEmail=me as string|null}={})=>userscriptPrompt({mobile,latest:'1.5.0',currentUserEmail,status:{version:'1.5.0',connection:'connected',user:me,...status}});
 it('asks to update an outdated script, with both versions',()=>{
  const p=prompt({version:'1.4.0',connection:'connected'});
  expect(p?.kind).toBe('update');expect(p?.description).toContain('1.4.0');expect(p?.description).toContain('1.5.0');
 });
 it('asks to update when the server says the script is outdated',()=>{expect(prompt({connection:'outdated'})?.kind).toBe('update');});
 it.each([
  ['missing token',{connection:'missing-token'},USERSCRIPT_NO_TOKEN_REASON],
  ['rejected token',{connection:'rejected'},USERSCRIPT_REJECTED_REASON],
  ['another user',{user:'otro@hospeda.test'},'otro@hospeda.test'],
 ] as const)('asks to connect on a %s',(_name,status,text)=>{
  const p=prompt(status);expect(p?.kind).toBe('connect');expect(p?.description).toContain(text);
 });
 it.each([
  ['a connected, current script',{}],
  ['the page still looking for the script',{version:undefined}],
  ['a token being verified',{connection:undefined}],
 ] as const)('stays hidden for %s',(_name,status)=>{expect(prompt(status)).toBeNull();});
 it('only warns, without blocking, when the CRM could not verify the token',()=>{expect(prompt({connection:'unknown'})).toMatchObject({kind:'unverified',blocking:false});});
 it('blocks for a missing, outdated or disconnected script',()=>{for(const status of [{version:null},{version:'1.4.0'},{connection:'rejected'}])expect(prompt(status)?.blocking).toBe(true);});
 it('asks to install when no script announced itself in this page',()=>{expect(prompt({version:null,connection:null})?.kind).toBe('install');});
 it('never shows on phones and tablets',()=>{expect(prompt({version:'1.0.0'},{mobile:true})).toBeNull();});
});
