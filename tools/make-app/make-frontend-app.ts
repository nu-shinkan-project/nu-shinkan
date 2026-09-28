#!/usr/bin/env node

/**
 * frontend テンプレートを apps 配下へ展開するスクリプトです。
 * 既存アプリのポート使用状況を見て、未使用ポートを自動で割り当てます。
 *
 * 想定実行場所: リポジトリルート
 * 使い方:
 *   - pnpm make:frontend
 *   - pnpm make:frontend my-frontend
 */

import { printHelp } from "./cli.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { runPreplace } from "./preplace.js";
import { runPlaceFrontend } from "./place-frontend.js";
import { runPostplace } from "./postplace.js";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const appsDir = resolve(rootDir, "apps");
const templateDir = resolve(rootDir, "templates/frontend-template");

/** Main Logic */
async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const preplace = await runPreplace({
      argv: process.argv.slice(2),
      appsDir,
      templateDir,
      appKind: "frontend",
      preferredPort: 5173,
      rl,
    });

    if (preplace.kind === "help") {
      printHelp("frontend");
      return;
    }

    const placedPlan = runPlaceFrontend(preplace.plan, templateDir);
    runPostplace({ appKind: "frontend", targetDir: placedPlan.targetDir });

    console.log(
      `\n✅ frontend app created: apps/${placedPlan.appName} (port: ${placedPlan.port})`,
    );
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ ${message}`);
  process.exit(1);
});
