import {apiJson} from "../helpers/apiClient";
import type { MessageVariableDefinition } from "../helpers/messageVariables";
import type { TemplateMaterialRef } from "../helpers/templateMaterials";

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

export type OperationalUser=Pick<SettingsUser,"id"|"email"|"displayName"|"role"> & Partial<Omit<SettingsUser,"id"|"email"|"displayName"|"role">>;

export type SettingsOutput = {
  cities: {id:string; name:string}[];
  subtypes: {id:string; typeName:string|null; name:string}[];
  authorizedEmails: {id:string; email:string; displayName:string|null}[];
  users: OperationalUser[];
  templates: {id:string; channel:string; name:string; subject:string|null; body:string; vertical:string|null; managementType:string|null;commercialProfile:string|null;purpose:string|null;active?:boolean;/** Sales material references with title and availability (spec 89 §9). */materialRefs?:TemplateMaterialRef[]}[];
  messageVariables?: MessageVariableDefinition[];
  templateVersions?: {templateId:string;version:number;snapshot:Record<string,unknown>;actorEmail:string|null;createdAt:Date}[];
  emailDelivery?: {
    senderName:string;
    senderEmail:string;
    replyToEmail:string;
    brevoConnected:boolean;
  };
  userscriptAutoRegister?:{enabled:boolean};
  userscriptAttachFiles?:{enabled:boolean};
  contactPositions:string[];
  contactChannels:string[];
  opportunityStages:string[];
  types:string[];
};

export const getSettings=async():Promise<SettingsOutput>=>{
  return apiJson<SettingsOutput>("/_api/settings");
};
