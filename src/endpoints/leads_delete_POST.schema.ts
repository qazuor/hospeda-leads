import { z } from "zod";
import superjson from "superjson";
export const schema = z.object({ id: z.union([z.string(), z.number()]) });
export type OutputType = { ok: true };
export const postLeadsDelete = async (body: z.infer<typeof schema>): Promise<OutputType> => {
  const result = await fetch("/_api/leads_delete", { method:"POST", headers:{"Content-Type":"application/json"}, body:superjson.stringify(schema.parse(body)) });
  if(!result.ok){ const error=superjson.parse<{error:string}>(await result.text()); throw new Error(error.error); }
  return superjson.parse<OutputType>(await result.text());
};