export const businessStatuses = [
  "new",
  "reviewed",
  "in_management",
  "no_follow_up_scheduled",
  "recontact",
  "archived",
] as const;

export type BusinessStatus = (typeof businessStatuses)[number];

export const businessStatusLabels: Record<BusinessStatus, string> = {
  new: "Nuevo",
  reviewed: "Revisado",
  in_management: "En gestión",
  no_follow_up_scheduled: "Sin seguimiento programado",
  recontact: "Recontactar",
  archived: "Archivado",
};

// Compatibilidad visual: cualquier estado posterior a Nuevo implica que el
// negocio ya fue revisado. El estado sigue siendo la fuente de verdad.
export const isReviewedBusinessStatus = (status: BusinessStatus | null | undefined): boolean =>
  (status ?? "new") !== "new";
