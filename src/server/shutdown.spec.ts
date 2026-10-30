// @vitest-environment node
import {createServer,request} from 'node:http';
import type {AddressInfo} from 'node:net';
import {spawn} from 'node:child_process';
import {describe,expect,it,vi} from 'vitest';
import {createShutdown} from './shutdown';

const listen=async(handler:Parameters<typeof createServer>[1])=>{const server=createServer(handler);await new Promise<void>((r)=>server.listen(0,'127.0.0.1',r));return {server,port:(server.address() as AddressInfo).port};};
const get=(port:number,path='/')=>new Promise<string>((resolve,reject)=>{request({port,host:'127.0.0.1',path,agent:false},(res)=>{let body='';res.on('data',(d)=>body+=d);res.on('end',()=>resolve(body));}).on('error',reject).end();});
// Probe below the ephemeral range (32768+): parallel suites make outgoing connections that can grab ports from it.
const freePort=async():Promise<number>=>{for(;;){const candidate=20000+Math.floor(Math.random()*10000);const probe=createServer();const ok=await new Promise<boolean>((r)=>{probe.once('error',()=>r(false));probe.listen(candidate,()=>r(true));});if(ok){await new Promise<void>((r)=>probe.close(()=>r()));return candidate;}}};
const sleep=(ms:number)=>new Promise((r)=>setTimeout(r,ms));

describe('createShutdown',()=>{
  it('lets an in-flight request finish, then releases resources and exits 0',async()=>{
    const {server,port}=await listen((_req,res)=>{setTimeout(()=>res.end('done'),300);});
    const order:string[]=[];const exit=vi.fn((code:number)=>{order.push(`exit:${code}`);});
    const shutdown=createShutdown({server,closeResources:async()=>{order.push('destroy');},exit,timeoutMs:5000});
    const inflight=get(port);await sleep(50);
    await shutdown('SIGTERM');
    expect(await inflight).toBe('done');expect(order).toEqual(['destroy','exit:0']);
    await expect(get(port)).rejects.toThrow();
  });
  it('forces exit 1 when in-flight requests outlive the timeout',async()=>{
    const {server,port}=await listen(()=>undefined);
    const exit=vi.fn();const closeResources=vi.fn(async()=>undefined);
    const shutdown=createShutdown({server,closeResources,exit,timeoutMs:100});
    get(port).catch(()=>undefined);await sleep(50);
    void shutdown('SIGTERM');await sleep(300);
    expect(exit).toHaveBeenCalledWith(1);expect(closeResources).not.toHaveBeenCalled();
  });
  it('runs only once and exits 1 when closing resources fails',async()=>{
    const {server}=await listen((_req,res)=>res.end());
    const exit=vi.fn();const closeResources=vi.fn(async()=>{throw new Error('boom');});
    const shutdown=createShutdown({server,closeResources,exit});
    await Promise.all([shutdown('SIGTERM'),shutdown('SIGINT')]);
    expect(closeResources).toHaveBeenCalledTimes(1);expect(exit).toHaveBeenCalledTimes(1);expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('server entrypoint',()=>{
  it('exits 0 on SIGTERM once started',async()=>{
    const port=String(await freePort());
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',"await import('./src/server/index.ts')"],{env:{...process.env,PORT:port,DATABASE_URL:'postgres://x:x@127.0.0.1:1/x',JWT_SECRET:'shutdown-spec-secret-0123456789abcdef',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
    let out='';child.stdout.on('data',(d)=>out+=d);child.stderr.on('data',(d)=>out+=d);
    const exited=new Promise<number|null>((r)=>child.on('exit',(code)=>r(code)));
    const started=Date.now();while(!out.includes('listening')&&Date.now()-started<20000&&child.exitCode===null)await sleep(100);
    expect(out).toContain('listening');
    child.kill('SIGTERM');
    expect(await exited).toBe(0);
  },30000);
});
