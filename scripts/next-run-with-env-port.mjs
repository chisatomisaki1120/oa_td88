import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env", override: false });
dotenv.config({ path: ".env.local", override: true });

const mode = process.argv[2];
if (!mode || (mode !== "dev" && mode !== "start")) {
  console.error("Usage: node scripts/next-run-with-env-port.mjs <dev|start>");
  process.exit(1);
}

const port = process.env.PORT || "3000";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nextCliPath = path.resolve(__dirname, "..", "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextCliPath, mode, "-p", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
