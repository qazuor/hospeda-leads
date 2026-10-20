import { z } from "zod";
import {postJson} from "../helpers/apiClient";
export const schema=z.object({
  displayName:z.string().trim().min(1).max(120),
  fullName:z.string().trim().max(180).nullable(),
  phone:z.string().trim().max(80).nullable(),
  sex:z.enum(["masculino","femenino","otro","prefiero_no_decir"]).nullable()
});
export type InputType=z.infer<typeof schema>;
export type OutputType={ok:true;user:{id:number;email:string;displayName:string;fullName:string|null;avatarUrl:string|null;role:"admin"|"user"}};
export const postProfile=async(body:InputType):Promise<OutputType>=>{
  return postJson<OutputType>("/_api/profile",schema.parse(body));
};