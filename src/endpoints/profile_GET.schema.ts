import {apiJson} from "../helpers/apiClient";
export type OutputType={profile:{id:number;email:string;displayName:string;fullName:string|null;phone:string|null;sex:string|null;senderEmail:string|null;role:"admin"|"user"}};
export const getProfile=async():Promise<OutputType>=>{
  return apiJson<OutputType>("/_api/profile");
};