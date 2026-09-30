import superjson from "superjson";

export type OutputType={version:string};
export const getLiveVersion=async():Promise<OutputType>=>{
  const r=await fetch("/_api/live_version",{cache:"no-store"});
  if(!r.ok)throw new Error("No se pudo comprobar el modo Live");
  return superjson.parse<OutputType>(await r.text());
};