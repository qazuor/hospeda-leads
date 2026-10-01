import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  nombre: z.string().min(1),
  scope: z.literal("opportunity").optional(),
  opportunityName: z.string().trim().min(1).max(300).nullable().optional(),
  serviceInterest: z.string().trim().max(2000).nullable().optional(),
  primaryContactId: z.string().regex(/^[1-9]\d*$/).nullable().optional(),
  estimatedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Fecha inválida").nullable().optional(),
  contactName: z.string().nullable().optional(),
  tipo: z.string().nullable().optional(),
  subtipo: z.string().nullable().optional(),
  commercialProfile: z.enum(["Independiente","Consolidado","Referente"]).nullable().optional(),
  ciudad: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  suscripcion: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  sitioWeb: z.string().nullable().optional(),
  urlGmap: z.string().nullable().optional(),
  perfilInstagram: z.string().nullable().optional(),
  perfilFacebook: z.string().nullable().optional(),
  perfilAirbnb: z.string().nullable().optional(),
  perfilBooking: z.string().nullable().optional(),
  perfilTurismoEntreRios: z.string().nullable().optional(),
  origen: z.string().nullable().optional(),
  quienCargo: z.string().nullable().optional(),
  asignadoA: z.string().nullable().optional(),
  assignedUserEmail: z.string().nullable().optional(),
  fechaCreacion: z.string().nullable().optional(),
  fechaUltimoContacto: z.string().nullable().optional(),
  medioContactoPreferido: z.string().nullable().optional(),
  resultadoUltimoContacto: z.string().nullable().optional(),
  prioridad: z.enum(["alta","media","baja"]).nullable().optional(),
  fechaProximaAccion: z.string().nullable().optional(),
  fuenteReferencia: z.string().nullable().optional(),
  clientePotencialRecurrente: z.boolean().optional(),
  archivoAdjunto: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  creadoPor: z.string().nullable().optional(),
  force: z.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;
export type DuplicateCandidate = {
  id: string;
  nombre: string;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  reasons: string[];
};
export type OutputType = { id: string } | { duplicateCandidates: DuplicateCandidate[] };

export const postLeadsSave = async (body: InputType): Promise<OutputType> => {
  const result = await fetch("/_api/leads_save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: superjson.stringify(schema.parse(body)),
  });
  if (!result.ok) {
    const error = superjson.parse<{ error: string }>(await result.text());
    throw new Error(error.error);
  }
  return superjson.parse<OutputType>(await result.text());
};