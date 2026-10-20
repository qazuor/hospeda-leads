type JournalEntry={action:string;createdAt:Date|string;metadata:unknown};
export type DoNotContactMark={at:Date|string;requested:boolean};
const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const flag=(value:Record<string,unknown>|null)=>value?value.doNotContact??value.do_not_contact:undefined;
/** State-trigger causes that only set "No contactar" when the business itself asked for it: a management closed with the DNC reason, or a response recorded as "Pidió no ser contactado". */
const requestCauses=new Set(['management_change','do_not_contact_response']);

/** Whether one business journal entry turned "No contactar" on (state trigger, contact policy or business edit). */
export function turnsDoNotContactOn(entry:JournalEntry):boolean {
  const metadata=record(entry.metadata);if(!metadata)return false;
  if(entry.action==='contact_policy'&&metadata.blocked===true&&metadata.before!==true)return true;
  const after=record(metadata.after),before=record(metadata.before);
  return flag(after)===true&&flag(before)!==true;
}

/** When "No contactar" was last turned on and whether the record says the business asked for it; null when the journal does not show it. */
export function doNotContactSince(journal:readonly JournalEntry[]):DoNotContactMark|null {
  let latest:JournalEntry|null=null;
  for(const entry of journal)if(turnsDoNotContactOn(entry)&&(!latest||new Date(entry.createdAt).getTime()>new Date(latest.createdAt).getTime()))latest=entry;
  if(!latest)return null;
  const cause=record(latest.metadata)?.cause;
  return {at:latest.createdAt,requested:typeof cause==='string'&&requestCauses.has(cause)};
}
