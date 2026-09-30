import type { Kysely, Transaction } from "kysely";
import type { DB, Json } from "./schema";

type DbExecutor=Kysely<DB>|Transaction<DB>;
type Actor={id?:number|null;email?:string|null;displayName:string};
type Change={fieldName:string;oldValue:unknown;newValue:unknown};

const serialize=(value:unknown):string|null=>{
  if(value===null||value===undefined)return null;
  if(value instanceof Date)return value.toISOString();
  if(typeof value==="object"){
    try{return JSON.stringify(value)}catch{return String(value)}
  }
  return String(value);
};

export async function writeLeadJournal(
  executor:DbExecutor,
  input:{
    leadId:string|number|null;
    leadName:string;
    leadCity?:string|null;
    leadType?:string|null;
    actor:Actor;
    action:string;
    changes?:Change[];
    metadata?:Json|null;
  }
){
  let leadCity=input.leadCity??null;
  let leadType=input.leadType??null;
  if(input.leadId!==null&&(input.leadCity===undefined||input.leadType===undefined)){
    const lead=await executor
      .selectFrom("leads")
      .select(["ciudad","tipo"])
      .where("id","=",String(input.leadId))
      .executeTakeFirst();
    if(input.leadCity===undefined)leadCity=lead?.ciudad??null;
    if(input.leadType===undefined)leadType=lead?.tipo??null;
  }
  const base={
    leadId:input.leadId===null?null:String(input.leadId),
    leadName:input.leadName,
    leadCity,
    leadType,
    actorUserId:input.actor.id??null,
    actorEmail:input.actor.email??null,
    actorName:input.actor.displayName,
    action:input.action,
    metadata:input.metadata??null,
  };
  const rows=input.changes?.length
    ? input.changes.map(change=>({
        ...base,
        fieldName:change.fieldName,
        oldValue:serialize(change.oldValue),
        newValue:serialize(change.newValue),
      }))
    : [{...base,fieldName:null,oldValue:null,newValue:null}];
  await executor.insertInto("leadJournal").values(rows).execute();
}