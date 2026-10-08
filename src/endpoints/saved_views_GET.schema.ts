import superjson from "superjson";
export type SavedLeadView={id?:string;name:string;config:Record<string,unknown>};
export type OutputType={views:SavedLeadView[]};
export const getSavedLeadViews=async():Promise<OutputType>=>{
  const r=await fetch("/_api/saved_views");
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};
