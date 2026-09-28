import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlacementPlan } from "./preplace.js";

/** Main Logic */
export function runPlaceFrontend(
  plan: PlacementPlan,
  templateDir: string,
): PlacementPlan {
  cpSync(templateDir, plan.targetDir, { recursive: true, force: false });

  updatePackageJson(plan.targetDir, plan.appName, plan.port);
  updateWranglerConfig(plan.targetDir, plan.appName);
  const envPath = join(plan.targetDir, ".env.development");
  writeFileSync(
    envPath,
    readFileSync(envPath, "utf8").replace(
      /^VITE_SELF=.*$/m,
      `VITE_SELF=http://localhost:${plan.port}`,
    ),
  );
  const deploymentPath = join(plan.targetDir, "deployment.yaml");
  writeFileSync(
    deploymentPath,
    readFileSync(deploymentPath, "utf8").replaceAll(
      "frontend-template",
      plan.appName,
    ),
  );

  return plan;
}

/** Helper */
function updatePackageJson(
  targetDir: string,
  appName: string,
  port: number,
): void {
  const packageJsonPath = join(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  packageJson.name = `@repo/${appName}`;
  packageJson.scripts ??= {};

  const currentDevScript = packageJson.scripts.dev;

  if (typeof currentDevScript !== "string") {
    throw new Error("package.json に dev script が見つかりません");
  }

  let didReplaceDevPort = false;
  const updatedDevScript = currentDevScript.replace(
    /--port(?:=|\s+)\d{2,5}/,
    (match) => {
      didReplaceDevPort = true;
      return match.includes("=") ? `--port=${port}` : `--port ${port}`;
    },
  );

  if (!didReplaceDevPort) {
    throw new Error(
      "package.json の dev script に --port 指定が見つかりません",
    );
  }

  packageJson.scripts.dev = updatedDevScript;

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function updateWranglerConfig(targetDir: string, appName: string): void {
  const configPath = join(targetDir, "wrangler.jsonc");
  const configText = readFileSync(configPath, "utf8");
  let didReplaceName = false;
  const updated = configText.replace(/"name"\s*:\s*"[^"]*"/, () => {
    didReplaceName = true;
    return `"name": "${appName}"`;
  });

  if (!didReplaceName) {
    throw new Error("wrangler.jsonc に name フィールドが見つかりません");
  }

  writeFileSync(configPath, updated);
}
