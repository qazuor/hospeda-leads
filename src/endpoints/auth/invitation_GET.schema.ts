import superjson from "superjson";

export type InvitationOutput={email:string;displayName:string};

export const getInvitation=async(token:string):Promise<InvitationOutput>=>{
  const r=await fetch("/_api/auth/invitation?token="+encodeURIComponent(token));
  if(!r.ok){
    const e=superjson.parse<{error:string}>(await r.text());
    throw new Error(e.error||"La invitación no es válida.");
  }
  return superjson.parse<InvitationOutput>(await r.text());
};
