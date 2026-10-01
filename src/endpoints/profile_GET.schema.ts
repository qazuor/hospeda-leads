import superjson from "superjson";
export type OutputType={profile:{id:number;email:string;displayName:string;fullName:string|null;phone:string|null;sex:string|null;senderEmail:string|null;role:"admin"|"user"}};
export const getProfile=async():Promise<OutputType>=>{
  const r=await fetch("/_api/profile");
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<OutputType>(await r.text());
};