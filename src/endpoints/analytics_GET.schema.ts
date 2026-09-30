import superjson from "superjson";
export type Bucket={name:string;count:number};
export type OutputType={
  total:number; pending:number; subscribed:number; overdue:number;
  withPhone:number; withEmail:number; withWebsite:number;
  byCity:Bucket[]; byStatus:Bucket[]; byType:Bucket[]; bySubtype:Bucket[]; byOrigin:Bucket[]; byPriority:Bucket[];
  createdByDay:{date:string;count:number}[];
};
export const getAnalytics=async():Promise<OutputType>=>{
  const r=await fetch("/_api/analytics");
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};