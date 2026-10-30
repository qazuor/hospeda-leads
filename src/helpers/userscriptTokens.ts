import {createHash,randomBytes} from 'node:crypto';
export function createUserscriptToken():string{return 'hcu_'+randomBytes(32).toString('base64url');}
export function hashUserscriptToken(token:string):string{return createHash('sha256').update(token).digest('hex');}
