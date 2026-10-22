// Writes migrations/036_message_catalog.sql from the message catalog. Run with `npm run build:message-catalog`.
import { writeFileSync } from 'node:fs';
import { buildMessageCatalogMigration, MESSAGE_CATALOG_MIGRATION } from '../src/content/messageCatalogMigration';

const target = new URL(`../migrations/${MESSAGE_CATALOG_MIGRATION}`, import.meta.url);
writeFileSync(target, buildMessageCatalogMigration().sql);
console.log(`Wrote migrations/${MESSAGE_CATALOG_MIGRATION}`);
