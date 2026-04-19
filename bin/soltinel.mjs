#!/usr/bin/env node
/**
 * `soltinel` CLI entry. Spawns tsx against src/index.ts so the user can launch
 * the bot from any directory after a one-time `npm link`.
 *
 *   soltinel                       # uses default token (BONK)
 *   soltinel <tokenMintAddress>    # analyse a specific token
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here    = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, "..");
const entry   = path.resolve(repoDir, "src", "index.ts");
const tsxCli  = path.resolve(repoDir, "node_modules", "tsx", "dist", "cli.mjs");

const child = spawn(
  process.execPath,
  [tsxCli, entry, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: repoDir },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("tsx not found — run `npm install` inside the soltinel repo first.");
  } else {
    console.error(err);
  }
  process.exit(1);
});
