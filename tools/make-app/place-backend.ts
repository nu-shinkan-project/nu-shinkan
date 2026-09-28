import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlacementPlan } from "./preplace.js";

export type BackendPlacementPlan = PlacementPlan & {
  appKind: "backend";
  inspectorPort: number;
};

/** Main Logic */
export function runPlaceBackend(
  plan: PlacementPlan,
  templateDir: string,
): BackendPlacementPlan {
  const inspectorPort = requireInspectorPort(plan);

  cpSync(templateDir, plan.targetDir, { recursive: true, force: false });

  updatePackageJson(plan.targetDir, plan.appName, plan.port, inspectorPort);
  updateWranglerConfig(plan.targetDir, plan.appName, plan.port);
  const deploymentPath = join(plan.targetDir, "deployment.yaml");
  writeFileSync(
    deploymentPath,
    readFileSync(deploymentPath, "utf8").replaceAll(
      "backend-template",
      plan.appName,
    ),
  );

  return {
    ...plan,
    appKind: "backend",
    inspectorPort,
  };
}

/** Helper */
function updatePackageJson(
  targetDir: string,
  appName: string,
  port: number,
  inspectorPort: number,
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

  let didReplaceInspectorPort = false;
  let updatedWithInspectorPort = updatedDevScript.replace(
    /--inspector-port(?:=|\s+)\d{2,5}/,
    (match) => {
      didReplaceInspectorPort = true;
      return match.includes("=")
        ? `--inspector-port=${inspectorPort}`
        : `--inspector-port ${inspectorPort}`;
    },
  );

  if (!didReplaceInspectorPort) {
    updatedWithInspectorPort = `${updatedWithInspectorPort} --inspector-port ${inspectorPort}`;
  }

  packageJson.scripts.dev = updatedWithInspectorPort;

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function updateWranglerConfig(
  targetDir: string,
  appName: string,
  port: number,
): void {
  const configPath = join(targetDir, "wrangler.jsonc");
  const configText = readFileSync(configPath, "utf8");
  let didReplaceName = false;
  const renamed = configText.replace(/"name"\s*:\s*"[^"]*"/, () => {
    didReplaceName = true;
    return `"name": "${appName}"`;
  });

  if (!didReplaceName) {
    throw new Error("wrangler.jsonc に name フィールドが見つかりません");
  }

  let didReplaceSelfPort = false;
  const updated = renamed.replace(/"SELF"\s*:\s*"[^"]*:\d{2,5}"/, () => {
    didReplaceSelfPort = true;
    return `"SELF": "http://localhost:${port}"`;
  });

  if (!didReplaceSelfPort) {
    throw new Error("wrangler.jsonc に SELF のポート設定が見つかりません");
  }

  writeFileSync(configPath, updated);
}

function requireInspectorPort(plan: PlacementPlan): number {
  if (plan.inspectorPort === undefined) {
    throw new Error("backend の inspector port が未設定です");
  }

  return plan.inspectorPort;
}
