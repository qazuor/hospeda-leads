import { serve } from "@hono/node-server";
import type {Server} from "node:http";
import {app} from "./app";
import {db} from "../helpers/db";
import {closeData} from "./mcp/data";
import {createShutdown} from "./shutdown";
import {refreshInstagramToken} from '../endpoints/inboundInstagram';

const port=Number(process.env.PORT||3001);
const server=serve({fetch:app.fetch,port},(info)=>{
  console.log(`Hospeda Leads listening on http://localhost:${info.port}`);
}) as Server;
const instagramRefreshTimer=setInterval(()=>void refreshInstagramToken(),24*60*60*1000);
instagramRefreshTimer.unref();
void refreshInstagramToken();
const shutdown=createShutdown({server,closeResources:async()=>{await db.destroy();await closeData();},exit:(code)=>process.exit(code),log:(message)=>console.log(message)});
for(const signal of ["SIGTERM","SIGINT"] as const)process.on(signal,()=>void shutdown(signal));
