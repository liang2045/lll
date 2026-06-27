import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dbPath = join(root, "prisma", "dev.db");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dingUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accessToken" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_dingUserId_key" ON "User"("dingUserId");

CREATE TABLE IF NOT EXISTS "SourceConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "documentId" TEXT,
  "workbookId" TEXT,
  "sheetId" TEXT,
  "baseId" TEXT,
  "tableId" TEXT,
  "primaryKeyField" TEXT,
  "syncIntervalSec" INTEGER NOT NULL DEFAULT 20,
  "lastSyncedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "authUserId" TEXT NOT NULL,
  CONSTRAINT "SourceConnection_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TableRowCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "dataJson" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "remoteHash" TEXT NOT NULL,
  "remoteDataJson" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TableRowCache_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TableRowCache_sourceId_rowId_key" ON "TableRowCache"("sourceId", "rowId");

CREATE TABLE IF NOT EXISTS "RelationConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "primarySourceId" TEXT NOT NULL,
  "secondarySourceId" TEXT NOT NULL,
  "primaryField" TEXT NOT NULL,
  "secondaryField" TEXT NOT NULL,
  "displayFieldsJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RelationConfig_primarySourceId_fkey" FOREIGN KEY ("primarySourceId") REFERENCES "SourceConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RelationConfig_secondarySourceId_fkey" FOREIGN KEY ("secondarySourceId") REFERENCES "SourceConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Conflict" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "baseValue" TEXT,
  "localValue" TEXT,
  "remoteValue" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Conflict_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`);

db.close();
console.log(`SQLite schema ready at ${dbPath}`);
