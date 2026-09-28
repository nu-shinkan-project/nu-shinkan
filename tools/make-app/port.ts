import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * apps 配下の既存プロジェクトからポート利用状況を収集し、
 * 新規アプリ作成時の空きポート選定に使うユーティリティです。
 */

const MIN_PORT = 1;
const MAX_PORT = 65_535;

const PORT_PATTERNS = [
  /--port(?:=|\s+)(\d{2,5})/g,
  /--inspector-port(?:=|\s+)(\d{2,5})/g,
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/g,
  /\bPORT\s*[:=]\s*["']?(\d{2,5})\b/g,
];

function parsePort(value: string): number | undefined {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port)) {
    return undefined;
  }

  if (port < MIN_PORT || port > MAX_PORT) {
    return undefined;
  }

  return port;
}

function extractPortsFromText(text: string): number[] {
  const ports: number[] = [];

  for (const pattern of PORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const rawPort = match[1];

      if (!rawPort) {
        continue;
      }

      const port = parsePort(rawPort);

      if (port !== undefined) {
        ports.push(port);
      }
    }
  }

  return ports;
}

export function collectUsedPorts(appsDir: string): Set<number> {
  // 既存アプリでよく使う設定ファイルを走査して、登場するポート番号を集約する。
  const usedPorts = new Set<number>();

  if (!existsSync(appsDir)) {
    return usedPorts;
  }

  const appDirectories = readdirSync(appsDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );

  for (const appDirectory of appDirectories) {
    const appDirPath = join(appsDir, appDirectory.name);
    const filesToCheck = [
      "package.json",
      "wrangler.jsonc",
      ".env",
      ".dev.vars",
    ];

    for (const fileName of filesToCheck) {
      const filePath = join(appDirPath, fileName);

      if (!existsSync(filePath)) {
        continue;
      }

      const content = readFileSync(filePath, "utf8");
      const ports = extractPortsFromText(content);

      for (const port of ports) {
        usedPorts.add(port);
      }
    }
  }

  return usedPorts;
}

export function findAvailablePort(
  usedPorts: Set<number>,
  preferredPort: number,
): number {
  // preferredPort 以上で最初に未使用のポートを返す。
  let candidate = preferredPort;

  while (usedPorts.has(candidate)) {
    candidate += 1;
  }

  if (candidate > MAX_PORT) {
    throw new Error("利用可能なポート番号が見つかりませんでした");
  }

  return candidate;
}
