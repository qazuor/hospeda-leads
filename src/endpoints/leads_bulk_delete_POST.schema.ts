import { z } from "zod";
import {postJson} from "../helpers/apiClient";
export const schema=z.object({entity:z.enum(["opportunity","business"]).default("opportunity"),ids:z.array(z.union([z.string(),z.number()])).min(1).max(500)});
export type InputType=z.input<typeof schema>;
export type OutputType={ok:true;deleted:number};
export const postLeadsBulkDelete=async(body:InputType):Promise<OutputType>=>{
  return postJson<OutputType>("/_api/leads_bulk_delete",schema.parse(body));
};