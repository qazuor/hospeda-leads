import { hash } from "bcryptjs";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL is required");
const sql=postgres(databaseUrl,{max:1});
const passwordHash=await hash("test-password-123",10);

await sql.begin(async tx=>{
  await tx`
    INSERT INTO authorized_emails(email,display_name,active)
    VALUES('admin@example.com','Admin Test',true)
    ON CONFLICT(email) DO UPDATE SET active=true
  `;

  const users=await tx`
    INSERT INTO users(email,display_name,role)
    VALUES('admin@example.com','Admin Test','admin')
    ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role
    RETURNING id
  `;
  const userId=users[0].id;

  await tx`
    INSERT INTO user_passwords(user_id,password_hash)
    VALUES(${userId},${passwordHash})
    ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash
  `;

  await tx`
    INSERT INTO crm_verticals(name,sort_order,active)
    VALUES('Alojamiento',1,true)
    ON CONFLICT(name) DO NOTHING
  `;

  await tx`
    INSERT INTO crm_cities(name,active)
    VALUES('Concepción del Uruguay',true)
    ON CONFLICT(name) DO NOTHING
  `;

  const [business]=await tx`
    INSERT INTO crm_accounts(nombre,tipo,ciudad,email,assigned_user_email)
    VALUES('Negocio de prueba','Alojamiento','Concepción del Uruguay','lead@example.com','admin@example.com')
    RETURNING id
  `;
  await tx`
    INSERT INTO leads(account_id,nombre,opportunity_name,tipo,ciudad,estado,email,commercial_profile,assigned_user_email)
    VALUES(${business.id},'Negocio de prueba','Gestión de prueba','Alojamiento','Concepción del Uruguay','Cargado','lead@example.com','Independiente','admin@example.com')
  `;
});
console.log("Seed completed");
await sql.end();
