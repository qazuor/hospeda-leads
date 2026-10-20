import { z } from "zod";
import {postJson} from "../helpers/apiClient";
export const schema = z.object({ id: z.union([z.string(), z.number()]) });
export type OutputType = { ok: true };
export const postLeadsDelete = async (body: z.infer<typeof schema>): Promise<OutputType> => {
  return postJson<OutputType>("/_api/leads_delete",schema.parse(body));
};