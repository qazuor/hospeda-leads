import {TOKEN_ACK_ATTRIBUTE,TOKEN_EVENT} from '../../userscript/src/announce';
import {listenForToken} from '../../userscript/src/tokenBridge';
import {handTokenToUserscript,supportsTokenBridge} from './userscriptConnect';

const token='hcu_'+'b'.repeat(43);

describe('handTokenToUserscript',()=>{
 afterEach(()=>{document.documentElement.removeAttribute(TOKEN_ACK_ATTRIBUTE);});

 it('resolves true once the script saves the token and acks this nonce',async()=>{
  // Arrange: the real script-side listener.
  const save=vi.fn(),stop=listenForToken({doc:document,save,recheck:()=>{}});
  try{
   // Act
   const ok=await handTokenToUserscript({token});
   // Assert
   expect(ok).toBe(true);expect(save).toHaveBeenCalledWith(token);
  }finally{stop();}
 });

 it('resolves false when no script answers in time',async()=>{
  vi.useFakeTimers();
  try{
   const result=handTokenToUserscript({token,timeoutMs:3000});
   vi.advanceTimersByTime(3000);
   expect(await result).toBe(false);
  }finally{vi.useRealTimers();}
 });

 it('ignores an ack for another request',async()=>{
  vi.useFakeTimers();
  const other=()=>{document.documentElement.setAttribute(TOKEN_ACK_ATTRIBUTE,'f'.repeat(32));document.dispatchEvent(new Event('hospeda-userscript-token-ack'));};
  document.addEventListener(TOKEN_EVENT,other);
  try{
   const result=handTokenToUserscript({token,timeoutMs:3000,nonce:'0'.repeat(32)});
   vi.advanceTimersByTime(3000);
   expect(await result).toBe(false);
  }finally{document.removeEventListener(TOKEN_EVENT,other);vi.useRealTimers();}
 });
});

describe('supportsTokenBridge',()=>{
 it.each([['1.5.1',true],['1.6.0',true],['1.5.0',false],[null,false],['garbage',false]] as const)('%s → %s',(version,expected)=>{expect(supportsTokenBridge({version})).toBe(expected);});
});
