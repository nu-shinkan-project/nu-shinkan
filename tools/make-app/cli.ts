import type { Interface } from "node:readline";

export type AppKind = "backend" | "frontend";

export type ScaffoldArgs = {
  appName?: string;
  help?: boolean;
};

export type AppCliConfig = {
  usage: string;
  defaultAppName: string;
};

/** CLI Config */
const APP_CLI_CONFIGS: Record<AppKind, AppCliConfig> = {
  backend: {
    usage: "pnpm make:backend [app-name]",
    defaultAppName: "my-backend",
  },
  frontend: {
    usage: "pnpm make:frontend [app-name]",
    defaultAppName: "my-frontend",
  },
};

export function getAppCliConfig(kind: AppKind): AppCliConfig {
  return APP_CLI_CONFIGS[kind];
}

export function printHelp(kind: AppKind): void {
  const config = getAppCliConfig(kind);
  console.log(`Usage: ${config.usage}`);
}

/** Main Logic */
export function normalizeAppName(value: string): string {
  const normalized = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    throw new Error("アプリ名が空です");
  }

  return normalized;
}

export function parseScaffoldArgs(args: string[], usage: string): ScaffoldArgs {
  const result: ScaffoldArgs = {};

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`不明なオプション "${arg}" Usage: ${usage}`);
    }

    if (!result.appName) {
      result.appName = arg;
      continue;
    }

    throw new Error(`不明な引数 "${arg}" Usage: ${usage}`);
  }

  return result;
}

/** Helper */
export function askAppName(
  rl: Interface,
  defaultValue: string,
): Promise<string> {
  return new Promise((resolve) => {
    const prompt = `アプリ名を入力してください [${defaultValue}]: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}
