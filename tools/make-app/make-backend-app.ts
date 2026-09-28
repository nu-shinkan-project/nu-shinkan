#!/usr/bin/env node

/**
 * backend テンプレートを apps 配下へ展開するスクリプトです。
 * 既存アプリのポート使用状況を見て、未使用ポートを自動で割り当てます。
 *
 * 想定実行場所: リポジトリルート
 * 使い方:
 *   - pnpm make:backend
 *   - pnpm make:backend my-backend
 */

import { printHelp } from "./cli.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { runPreplace } from "./preplace.js";
import { runPlaceBackend } from "./place-backend.js";
import { runPostplace } from "./postplace.js";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const appsDir = resolve(rootDir, "apps");
const templateDir = resolve(rootDir, "templates/backend-template");
const BACKEND_DEFAULT_INSPECTOR_PORT = 9229;

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
      appKind: "backend",
      preferredPort: 6173,
      inspectorPreferredPort: BACKEND_DEFAULT_INSPECTOR_PORT,
      rl,
    });

    if (preplace.kind === "help") {
      printHelp("backend");
      return;
    }

    const placedPlan = runPlaceBackend(preplace.plan, templateDir);
    runPostplace({ appKind: "backend", targetDir: placedPlan.targetDir });

    console.log(
      `\n✅ backend app created: apps/${placedPlan.appName} (port: ${placedPlan.port}, inspector-port: ${placedPlan.inspectorPort})`,
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
