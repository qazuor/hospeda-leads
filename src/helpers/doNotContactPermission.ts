/** Message shown (UI) and returned (server) when someone who is not responsible tries to record "Pidió no ser contactado" (decision D1). */
export const DO_NOT_CONTACT_RECORD_DENIED='Solo el responsable del negocio, el de una de sus gestiones o un administrador puede registrar «Pidió no ser contactado».';
/** Message for any other change to a No contactar business (decision 1C). */
export const DO_NOT_CONTACT_READ_ONLY='Este negocio pidió no ser contactado. Solo un administrador puede modificarlo.';

/**
 * Decision D1, single rule for client and server: "Pidió no ser contactado" may be recorded by an admin, by the responsible of the business
 * (crm_accounts.assigned_user_email) or by the responsible of one of its not deleted managements (leads.assigned_user_email).
 * The server mirrors it with `assertCanRecordDoNotContact` (crmPermissions.ts), which loads the management owners from the database.
 */
export function canRecordDoNotContact({admin,userEmail,businessOwnerEmail,managementOwnerEmails}:{admin:boolean;userEmail?:string|null;businessOwnerEmail?:string|null;managementOwnerEmails?:readonly (string|null|undefined)[]}):boolean {
  if(admin)return true;
  if(!userEmail)return false;
  return businessOwnerEmail===userEmail||!!managementOwnerEmails?.some(email=>email===userEmail);
}

/** Decision 1C: only an administrator lifts a No contactar block, also by correcting the response that caused it. */
export const DO_NOT_CONTACT_LIFT_DENIED='Solo un administrador puede levantar el bloqueo No contactar. Pedíselo a un administrador.';
