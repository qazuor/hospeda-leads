import {apiJson} from "../../helpers/apiClient";

export type InvitationOutput={email:string};

export const getInvitation=async(token:string):Promise<InvitationOutput>=>{
  return apiJson<InvitationOutput>("/_api/auth/invitation?token="+encodeURIComponent(token),{},{fallback:"La invitación no es válida.",sessionEvent:false});
};
