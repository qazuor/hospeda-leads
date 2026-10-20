import superjson from "superjson";

/** Live version per invalidation domain (`crm_live_version:<domain>`); `version` is the legacy global key. */
export type OutputType={version:string;domains?:Record<string,string>};
export const getLiveVersion=async():Promise<OutputType>=>{
  const r=await fetch("/_api/live_version",{cache:"no-store"});
  if(!r.ok)throw new Error("No se pudo comprobar el modo Live");
  return superjson.parse<OutputType>(await r.text());
};
