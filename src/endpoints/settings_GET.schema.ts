import superjson from "superjson";

export type SettingsUser={
  id:number;
  email:string;
  fullName:string|null;
  displayName:string;
  phone:string|null;
  sex:string|null;
  senderEmail:string|null;
  role:"admin"|"user";
  hasPassword:boolean;
  invitationPending:boolean;
};

export type SettingsOutput = {
  cities: {id:string; name:string}[];
  subtypes: {id:string; typeName:string|null; name:string}[];
  authorizedEmails: {id:string; email:string; displayName:string|null}[];
  users: SettingsUser[];
  templates: {id:string; channel:string; name:string; subject:string|null; body:string; vertical:string|null; commercialProfile:string|null}[];
  emailDelivery: {
    senderName:string;
    senderEmail:string;
    replyToEmail:string;
    brevoConnected:boolean;
  };
  types:string[];
};

export const getSettings=async():Promise<SettingsOutput>=>{
  const r=await fetch("/_api/settings");
  if(!r.ok){const e=superjson.parse<{error:string}>(await r.text());throw new Error(e.error)}
  return superjson.parse<SettingsOutput>(await r.text());
};
