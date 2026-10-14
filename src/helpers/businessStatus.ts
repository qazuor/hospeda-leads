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
