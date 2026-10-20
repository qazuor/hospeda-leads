type JournalEntry={action:string;createdAt:Date|string;metadata:unknown};
const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const flag=(value:Record<string,unknown>|null)=>value?value.doNotContact??value.do_not_contact:undefined;

/** Whether one business journal entry turned "No contactar" on (state trigger, contact policy or business edit). */
export function turnsDoNotContactOn(entry:JournalEntry):boolean {
  const metadata=record(entry.metadata);if(!metadata)return false;
  if(entry.action==='contact_policy'&&metadata.blocked===true&&metadata.before!==true)return true;
  const after=record(metadata.after),before=record(metadata.before);
  return flag(after)===true&&flag(before)!==true;
}

/** When the business was marked "No contactar": the latest journal entry that turned it on, or null when the journal does not show it. */
export function doNotContactSince(journal:readonly JournalEntry[]):Date|string|null {
  let latest:JournalEntry|null=null;
  for(const entry of journal)if(turnsDoNotContactOn(entry)&&(!latest||new Date(entry.createdAt).getTime()>new Date(latest.createdAt).getTime()))latest=entry;
  return latest?latest.createdAt:null;
}
