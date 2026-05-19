import fs from "node:fs";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { getDataPaths } from "./paths";

let SQL: SqlJsStatic | null = null;
let connection: Database | null = null;

export async function getDatabase() {
  if (connection) {
    return connection;
  }

  const { db } = getDataPaths();

  SQL =
    SQL ??
    (await initSqlJs({
      locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
    }));

  connection = fs.existsSync(db) ? new SQL.Database(fs.readFileSync(db)) : new SQL.Database();
  connection.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL DEFAULT 'reminder',
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      due_at TEXT NOT NULL,
      repeat_rule TEXT,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      markdown_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
    CREATE INDEX IF NOT EXISTS idx_reminders_item_type ON reminders(item_type);
  `);

  const columns = connection.exec("PRAGMA table_info(reminders)");
  const columnNames = new Set(columns[0]?.values.map((row) => row[1]) ?? []);
  if (!columnNames.has("item_type")) {
    connection.run("ALTER TABLE reminders ADD COLUMN item_type TEXT NOT NULL DEFAULT 'reminder'");
  }

  return connection;
}

export async function persistDatabase() {
  const database = await getDatabase();
  const { db } = getDataPaths();
  fs.writeFileSync(db, Buffer.from(database.export()));
}
