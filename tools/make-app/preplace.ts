import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Interface } from "node:readline";
import {
  askAppName,
  getAppCliConfig,
  type AppKind,
  normalizeAppName,
  parseScaffoldArgs,
} from "./cli.js";
import { collectUsedPorts, findAvailablePort } from "./port.js";

export type PlacementPlan = {
  appKind: AppKind;
  appName: string;
  targetDir: string;
  port: number;
  inspectorPort?: number;
};

export type PreplaceResult =
  { kind: "help" } | { kind: "plan"; plan: PlacementPlan };

export type PreplaceInput = {
  argv: string[];
  appsDir: string;
  templateDir: string;
  appKind: AppKind;
  preferredPort: number;
  inspectorPreferredPort?: number;
  rl: Interface;
};

/** Main Logic */
export async function runPreplace(
  input: PreplaceInput,
): Promise<PreplaceResult> {
  const cliConfig = getAppCliConfig(input.appKind);
  const args = parseScaffoldArgs(input.argv, cliConfig.usage);

  if (args.help) {
    return { kind: "help" };
  }

  if (!existsSync(input.templateDir)) {
    throw new Error(`テンプレートが見つかりません: ${input.templateDir}`);
  }

  mkdirSync(input.appsDir, { recursive: true });

  const usedPorts = collectUsedPorts(input.appsDir);
  const port = findAvailablePort(usedPorts, input.preferredPort);

  let inspectorPort: number | undefined;

  if (input.inspectorPreferredPort !== undefined) {
    const usedPortsWithDevPort = new Set(usedPorts);
    usedPortsWithDevPort.add(port);
    inspectorPort = findAvailablePort(
      usedPortsWithDevPort,
      input.inspectorPreferredPort,
    );
  }

  const requestedName =
    args.appName ?? (await askAppName(input.rl, cliConfig.defaultAppName));
  const appName = normalizeAppName(requestedName);
  const targetDir = resolve(input.appsDir, appName);

  if (existsSync(targetDir)) {
    throw new Error(`apps/${appName} は既に存在します`);
  }

  return {
    kind: "plan",
    plan: {
      appKind: input.appKind,
      appName,
      targetDir,
      port,
      inspectorPort,
    },
  };
}
