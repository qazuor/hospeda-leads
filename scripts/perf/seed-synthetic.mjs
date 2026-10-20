import { hash } from "bcryptjs";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.CRM_TEST_DATABASE !== "1") throw new Error("CRM_TEST_DATABASE=1 is required for the synthetic dataset seed");

const socketPath = process.env.CRM_TEST_DATABASE_SOCKET;
const parsedUrl = new URL(databaseUrl);
const host = parsedUrl.hostname;
const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
const pgHost = process.env.PGHOST;
const localPgHost = !pgHost || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(pgHost);
const unixSocketHost = host === "" && Boolean(socketPath) && localPgHost;
// Opt-in for a disposable container IP: CRM_PERF_ALLOW_HOST must equal the URL host exactly.
const allowedHost = process.env.CRM_PERF_ALLOW_HOST;
const allowlistedHost = Boolean(allowedHost) && host === allowedHost;
if (!localHost && !unixSocketHost && !allowlistedHost) {
  throw new Error("Synthetic dataset seed only allows a local DATABASE_URL host, CRM_TEST_DATABASE_SOCKET, or an exact CRM_PERF_ALLOW_HOST match");
}

const sql = postgres(databaseUrl, { max: 1, ...(socketPath ? { path: socketPath } : {}) });
const counts = { accounts: 3500, contacts: 4500, leads: 4000, tasks: 9000, activities: 50000, notes: 6000 };
const batchSize = 1000;
let state = 0x5eed1234;
function random() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 0x100000000;
}
function pick(values) { return values[Math.floor(random() * values.length)]; }
function chunks(values, size = batchSize) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
async function insertJson(tx, table, columns, types, rows) {
  for (const batch of chunks(rows)) {
    const json = JSON.stringify(batch);
    const definitions = columns.map((column, index) => `${column} ${types[index]}`).join(",");
    await tx.unsafe(
      `INSERT INTO ${table} (${columns.join(",")}) SELECT ${columns.join(",")} FROM jsonb_to_recordset($1::text::jsonb) AS rows(${definitions})`,
      [json],
    );
  }
}

const cities = ["Concepción del Uruguay", "Colón", "Gualeguaychú", "Paraná", "Victoria", "Federación", "Concordia"];
const verticals = ["Alojamiento", "Gastronomía", "Actividades", "Turismo rural"];
const types = ["main", "partner", "provider", "editor", "accompaniment"];
const stageByType = {
  main: ["main:contact", "main:contacted", "main:interested", "main:evaluating_plan"],
  partner: ["partner:contact", "partner:contacted", "partner:conversation", "partner:interest", "partner:proposal_preparing", "partner:proposal_sent", "partner:negotiation"],
  provider: ["provider:contact", "provider:contacted", "provider:information_sent", "provider:interested", "provider:coordinating"],
  editor: ["editor:contact", "editor:contacted", "editor:information_sent", "editor:interested", "editor:coordinating"],
  accompaniment: ["accompaniment:pending", "accompaniment:contacted", "accompaniment:working"],
};
const names = ["La Ribera", "Los Aromos", "Casa del Río", "El Ceibo", "Las Acacias", "Puerto Viejo", "Brisa Norte"];
const firstNames = ["Ana", "Carlos", "Lucía", "Mateo", "Sofía", "Julián", "Valentina", "Tomás", "Micaela", "Facundo"];
const lastNames = ["Gómez", "Pérez", "Fernández", "López", "Martínez", "Díaz", "Acosta", "Benítez"];
const sellers = Array.from({ length: 4 }, (_, index) => ({
  email: `seller${index + 1}@example.test`, name: `Vendedor ${index + 1}`, role: "user",
}));
const users = [{ email: "admin@example.com", name: "Admin Test", role: "admin" }, ...sellers];
const passwordHash = await hash("test-password-123", 10);

try {
  await sql.begin(async tx => {
    const existing = await tx`SELECT count(*)::int AS count FROM crm_accounts WHERE nombre LIKE 'Perf synthetic #%';`;
    if (existing[0].count > 0) throw new Error("Synthetic dataset already exists; use a freshly migrated and seeded local database");

    for (const user of users) {
      await tx`INSERT INTO authorized_emails(email,display_name,active) VALUES(${user.email},${user.name},true) ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,active=true`;
    }
    const userRows = await tx`
      INSERT INTO users(email,display_name,role)
      SELECT email,name,role FROM jsonb_to_recordset(${JSON.stringify(users)}::text::jsonb) AS u(email text,name text,role user_role)
      ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role RETURNING id,email
    `;
    for (const user of userRows) await tx`INSERT INTO user_passwords(user_id,password_hash) VALUES(${user.id},${passwordHash}) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash`;

    for (const [index, name] of verticals.entries()) await tx`INSERT INTO crm_verticals(name,sort_order,active) VALUES(${name},${index + 1},true) ON CONFLICT(name) DO NOTHING`;
    for (const name of cities) await tx`INSERT INTO crm_cities(name,active) VALUES(${name},true) ON CONFLICT(name) DO NOTHING`;

    const accountRows = Array.from({ length: counts.accounts }, (_, index) => ({
      nombre: `Perf synthetic #${String(index + 1).padStart(4, "0")} ${pick(names)}`,
      ciudad: pick(cities), tipo: pick(verticals), email: `business${index + 1}@example.test`,
      assigned_user_email: pick(sellers).email, status: "reviewed",
    }));
    const accounts = [];
    for (const batch of chunks(accountRows)) {
      const inserted = await tx`
        INSERT INTO crm_accounts(nombre,ciudad,tipo,email,assigned_user_email,status)
        SELECT nombre,ciudad,tipo,email,assigned_user_email,status
        FROM ROWS FROM (jsonb_to_recordset(${JSON.stringify(batch)}::text::jsonb) AS (nombre text,ciudad text,tipo text,email text,assigned_user_email text,status text)) WITH ORDINALITY AS a
        ORDER BY ordinality
        RETURNING id
      `;
      accounts.push(...inserted.map(row => row.id));
    }

    const contactRows = Array.from({ length: counts.contacts }, (_, index) => {
      const accountIndex = index < counts.accounts ? index : Math.floor(random() * counts.accounts);
      const first = pick(firstNames);
      return {
        account_id: accounts[accountIndex], name: `${first} ${pick(lastNames)}`,
        phone: `+54934${String(20000000 + Math.floor(random() * 79999999))}`,
        email: `contact${index + 1}@example.test`, is_primary: index < counts.accounts,
      };
    });
    for (const batch of chunks(contactRows)) {
      await tx`
        INSERT INTO crm_contacts(account_id,name,phone,email,is_primary)
        SELECT account_id,name,phone,email,is_primary
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::text::jsonb) AS c(account_id bigint,name text,phone text,email text,is_primary boolean)
      `;
    }

    const leadRows = Array.from({ length: counts.leads }, (_, index) => {
      const accountIndex = index < counts.accounts ? index : Math.floor(random() * counts.accounts);
      const managementType = pick(types);
      const email = pick(sellers).email;
      return {
        account_id: accounts[accountIndex], nombre: accountRows[accountIndex].nombre,
        opportunity_name: `${pick(["Plan anual", "Alianza", "Actualización", "Participación"])} ${index + 1}`,
        tipo: accountRows[accountIndex].tipo, ciudad: accountRows[accountIndex].ciudad,
        estado: pick(stageByType[managementType]), email: accountRows[accountIndex].email,
        contact_name: null, commercial_profile: pick(["Independiente", "Cadena", "Otro"]),
        assigned_user_email: email, management_type: managementType,
        deleted_at: random() < 0.1 ? new Date(Date.UTC(2026, 0, 1 + Math.floor(random() * 290))).toISOString() : null,
      };
    });
    const leadIds = [];
    for (const batch of chunks(leadRows)) {
      const inserted = await tx`
        INSERT INTO leads(account_id,nombre,opportunity_name,tipo,ciudad,estado,email,contact_name,commercial_profile,assigned_user_email,management_type,deleted_at)
        SELECT account_id,nombre,opportunity_name,tipo,ciudad,estado,email,contact_name,commercial_profile,assigned_user_email,management_type,deleted_at
        FROM ROWS FROM (jsonb_to_recordset(${JSON.stringify(batch)}::text::jsonb) AS (account_id bigint,nombre text,opportunity_name text,tipo text,ciudad text,estado text,email text,contact_name text,commercial_profile text,assigned_user_email text,management_type text,deleted_at timestamptz)) WITH ORDINALITY AS l
        ORDER BY ordinality
        RETURNING id
      `;
      leadIds.push(...inserted.map(row => row.id));
    }
    const leadIndexById = new Map(leadIds.map((id, index) => [id, index]));

    const taskRows = Array.from({ length: counts.tasks }, (_, index) => {
      const leadIndex = Math.floor(random() * leadIds.length);
      const lead = leadRows[leadIndex];
      return {
        account_id: lead.account_id, lead_id: leadIds[leadIndex],
        title: `${pick(["Llamar", "Enviar información", "Coordinar reunión", "Hacer seguimiento"])} ${index + 1}`,
        type_id: pick(["followup", "call", "message", "meeting", "visit", "proposal", "other"]),
        assigned_user_email: lead.assigned_user_email,
        due_date: new Date(Date.UTC(2026, 9, 20 + Math.floor(random() * 60))).toISOString().slice(0, 10),
        priority: pick(["alta", "media", "baja"]), status: random() < 0.3 ? "pending" : "completed",
        completed_at: null,
      };
    });
    // A completed task must have a completion timestamp; pending tasks must not.
    for (const task of taskRows) if (task.status === "completed") task.completed_at = "2026-10-20T12:00:00.000Z";
    const taskRecords = [];
    for (const batch of chunks(taskRows)) {
      const inserted = await tx`
        INSERT INTO crm_tasks(account_id,lead_id,title,type_id,assigned_user_email,due_date,priority,status,completed_at)
        SELECT account_id,lead_id,title,type_id,assigned_user_email,due_date,priority,status,completed_at
        FROM ROWS FROM (jsonb_to_recordset(${JSON.stringify(batch)}::text::jsonb) AS (account_id bigint,lead_id bigint,title text,type_id text,assigned_user_email text,due_date date,priority text,status text,completed_at timestamptz)) WITH ORDINALITY AS t
        ORDER BY ordinality
        RETURNING id
      `;
      for (const [batchIndex, row] of inserted.entries()) {
        taskRecords.push({ id: row.id, leadId: batch[batchIndex].lead_id });
      }
    }

    const activityRows = Array.from({ length: counts.activities }, (_, index) => {
      const task = index < taskRecords.length ? taskRecords[index] : null;
      const leadId = task?.leadId ?? leadIds[Math.floor(random() * leadIds.length)];
      const leadIndex = leadIndexById.get(leadId);
      const lead = leadRows[leadIndex];
      return {
        account_id: lead.account_id, lead_id: leadId,
        task_id: task?.id ?? null,
        type_id: pick(["followup", "call", "message", "meeting", "visit", "proposal", "other"]),
        title: `Actividad sintética ${index + 1}`,
        occurred_at: new Date(Date.UTC(2026, 0, 1 + Math.floor(random() * 292), Math.floor(random() * 24))).toISOString(),
        participants: "", contact_ids: [], channel: pick(["phone", "email", "whatsapp", null]),
        result: pick(["Sin respuesta", "Conversación iniciada", "Información enviada", null]),
        notes: `Registro sintético ${index + 1}`, actor_email: pick(sellers).email,
      };
    });
    await tx.unsafe("CREATE INDEX perf_tmp_act_lead ON crm_activities(lead_id)");
    // The per-row contact projection trigger updates leads for every activity (50k heavy updates).
    // Disable it for the bulk insert and project once per lead afterwards (same final state, transactional).
    await tx.unsafe("ALTER TABLE crm_activities DISABLE TRIGGER crm_activity_contact");
    await insertJson(tx, "crm_activities", ["account_id", "lead_id", "task_id", "type_id", "title", "occurred_at", "participants", "contact_ids", "channel", "result", "notes", "actor_email"], ["bigint", "bigint", "bigint", "text", "text", "timestamptz", "text", "jsonb", "text", "text", "text", "text"], activityRows);

    const noteRows = Array.from({ length: counts.notes }, (_, index) => ({
      lead_id: leadIds[Math.floor(random() * leadIds.length)],
      note: `Nota sintética ${index + 1}: seguimiento de prueba para mediciones locales.`,
      author: pick(sellers).email,
    }));
    await insertJson(tx, "lead_notes", ["lead_id", "note", "author"], ["bigint", "text", "text"], noteRows);
    await tx.unsafe("ALTER TABLE crm_activities ENABLE TRIGGER crm_activity_contact");
    await tx.unsafe("SELECT crm_project_contact(id) FROM leads");
    await tx.unsafe("DROP INDEX perf_tmp_act_lead");
  });

  const tableNames = ["crm_accounts", "crm_contacts", "leads", "crm_tasks", "crm_activities", "lead_notes"];
  const finalCounts = {};
  for (const table of tableNames) {
    const [row] = await sql.unsafe(`SELECT count(*)::int AS count FROM ${table}`);
    finalCounts[table] = row.count;
  }
  console.log("Synthetic dataset inserted successfully.");
  console.log("Final table row counts:");
  for (const [table, count] of Object.entries(finalCounts)) console.log(`  ${table}: ${count}`);
} finally {
  await sql.end();
}
