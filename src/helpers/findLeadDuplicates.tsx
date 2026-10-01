import { sql } from "kysely";
import { db } from "./db";

export type DuplicateCandidate = {
  id: string;
  nombre: string;
  ciudad: string | null;
  telefono: string | null;
  email: string | null;
  reasons: string[];
};

export async function findLeadDuplicates(input: {
  nombre: string;
  ciudad?: string | null;
  telefono?: string | null;
  email?: string | null;
}) {
  const found = new Map<string, DuplicateCandidate>();
  const add = (row: any, reason: string) => {
    const id = String(row.id);
    const accountKey=String(row.accountId??row.id);
    const existing = found.get(accountKey) ?? {
      id,
      nombre: row.nombre,
      ciudad: row.ciudad,
      telefono: row.telefono,
      email: row.email,
      reasons: [] as string[],
    };
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    found.set(accountKey, existing);
  };

  const byName = await db
    .selectFrom("leads")
    .select(["id","accountId","nombre","ciudad","telefono","email"])
    .where("deletedAt","is",null)
    .where(sql<string>`lower(trim(nombre))`, "=", input.nombre.trim().toLowerCase())
    .where(sql<string>`lower(coalesce(ciudad,''))`, "=", (input.ciudad ?? "").trim().toLowerCase())
    .distinctOn("accountId").orderBy("accountId").orderBy("id")
    .limit(10)
    .execute();
  byName.forEach((row) => add(row, "Mismo nombre y ciudad"));

  if (input.email?.trim()) {
    const byEmail = await db
      .selectFrom("leads")
      .select(["id","accountId","nombre","ciudad","telefono","email"])
      .where("deletedAt","is",null)
      .where(sql<string>`lower(trim(coalesce(email,'')))`, "=", input.email.trim().toLowerCase())
      .distinctOn("accountId").orderBy("accountId").orderBy("id")
    .limit(10)
      .execute();
    byEmail.forEach((row) => add(row, "Mismo email"));
  }

  const phone = (input.telefono ?? "").replace(/\D/g, "");
  if (phone.length >= 6) {
    const byPhone = await db
      .selectFrom("leads")
      .select(["id","accountId","nombre","ciudad","telefono","email"])
      .where("deletedAt","is",null)
      .where(sql<string>`regexp_replace(coalesce(telefono,''), '\\D', '', 'g')`, "=", phone)
      .distinctOn("accountId").orderBy("accountId").orderBy("id")
    .limit(10)
      .execute();
    byPhone.forEach((row) => add(row, "Mismo teléfono"));
  }

  return Array.from(found.values());
}