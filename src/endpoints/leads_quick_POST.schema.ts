import { z } from "zod";
import {postJson} from "../helpers/apiClient";

export const schema = z.object({
  accountId:z.string().optional(),
  scope:z.enum(["business","management"]).optional(),
  expectedClassification:z.object({tipo:z.string().nullable(),subtipo:z.string().nullable()}).optional(),
  id: z.union([z.string(), z.number()]),
  field: z.enum([
    "origen","creadoPor","tipo","subtipo","commercialProfile","ciudad","estado","prioridad","quienCargo","assignedUserEmail","medioContactoPreferido",
    "fechaCreacion","fechaUltimoContacto","fechaProximaAccion"
  ]),
  value: z.string().nullable(),
  expectedValue:z.string().nullable().optional(),
});
export type OutputType = { ok: true };
export const postLeadsQuick = async (body: z.infer<typeof schema>): Promise<OutputType> => {
  return postJson<OutputType>("/_api/leads_quick",schema.parse(body));
};
