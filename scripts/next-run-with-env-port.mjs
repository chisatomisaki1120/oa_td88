import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config({ path: ".env", override: false });
dotenv.config({ path: ".env.local", override: true });

const mode = process.argv[2];
if (!mode || (mode !== "dev" && mode !== "start")) {
  console.error("Usage: node scripts/next-run-with-env-port.mjs <dev|start>");
  process.exit(1);
}

const port = process.env.PORT || "3000";

function resolveDbPath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = databaseUrl.replace(/^file:/, "");
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function pruneOldBackups(backupDir, maxFiles) {
  if (maxFiles <= 0) return;
  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => ({
      name,
      fullPath: path.join(backupDir, name),
      mtime: fs.statSync(path.join(backupDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(maxFiles)) {
    fs.rmSync(file.fullPath, { force: true });
  }
}

function setupAutoBackup() {
  const enabled = (process.env.DB_AUTO_BACKUP_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) return { stop: () => {} };

  const intervalMinutes = Number(process.env.DB_AUTO_BACKUP_INTERVAL_MINUTES ?? "15");
  const intervalMs = Math.max(1, Number.isFinite(intervalMinutes) ? intervalMinutes : 15) * 60 * 1000;
  const maxFiles = Math.max(1, Number(process.env.DB_BACKUP_MAX_FILES ?? "96"));
  const backupDir = path.resolve(process.cwd(), process.env.DB_BACKUP_DIR ?? "backups/auto");
  const dbPath = resolveDbPath();

  fs.mkdirSync(backupDir, { recursive: true });
  let running = false;

  const backupOnce = async () => {
    if (running) return;
    if (!fs.existsSync(dbPath)) return;
    running = true;
    const backupFile = path.join(backupDir, `db-${timestampForFile()}.db`);
    let db;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      await db.backup(backupFile);
      pruneOldBackups(backupDir, maxFiles);
      console.log(`[db-backup] Saved ${backupFile}`);
    } catch (error) {
      console.error("[db-backup] Failed:", error);
    } finally {
      db?.close();
      running = false;
    }
  };

  void backupOnce();
  const timer = setInterval(() => {
    void backupOnce();
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nextCliPath = path.resolve(__dirname, "..", "node_modules", "next", "dist", "bin", "next");
const backupWorker = setupAutoBackup();

const child = spawn(process.execPath, [nextCliPath, mode, "-p", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  backupWorker.stop();
  process.exit(code ?? 0);
});
