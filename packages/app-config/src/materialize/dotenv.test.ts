import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { generateDotenv } from "./dotenv.js";
import { testExports } from "../config-file/deployment.yaml.js";
import { parseContext } from "./context.js";

vi.mock("node:process", () => ({ cwd: () => process.cwd() }));

it("resolves overrides and preview URLs without exposing dotenv prefixes to materialization", () => {
  const root = mkdtempSync(join(tmpdir(), "materialize-dotenv-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  const original =
    "# keep\nVITE_API=https://api-staging.example/path\nVITE_KEEP=native\nVITE_ENV=native";
  try {
    writeFileSync(join(root, ".env.development"), original);
    generateDotenv(
      {
        deployment: testExports.asDeployment({
          connections: { urls: { API: "api" } },
        }),
        overrides: { ENV: "deployment" },
      },
      parseContext({
        DEPLOY_CHANNEL: "preview",
        PR_NUMBER: "42",
        TARGETS: JSON.stringify([
          { package: "api", path: "apps/api", workerName: "api" },
        ]),
      }),
    );
    const result = readFileSync(join(root, ".env.production"), "utf8");
    expect(result).toContain(
      'VITE_API="https://api-preview-42.nushinkan2.workers.dev/path"',
    );
    expect(result).toContain('VITE_KEEP="native"');
    expect(result).toContain('VITE_ENV="deployment"');
    expect(result).not.toContain("VITE_VITE_");
    expect(readFileSync(join(root, ".env.development"), "utf8")).toBe(original);
  } finally {
    cwd.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
