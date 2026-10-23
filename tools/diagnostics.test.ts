import { expect, it } from "vitest";
import { diagnostic, errorDetail, commandFailure } from "./diagnostics.js";

it("masks environment values, credentials and configuration snippets while keeping the diagnosis", () => {
  const text = diagnostic(
    'Authentication failed: Bearer unknown-token\nAPI_TOKEN=another-token\nenv.PUBLIC_VALUE (plain-config-value)\nconfig: "quoted-config-value"\n  3 │ secret-config-line\nService Binding target missing: backend-preview-1\nknown-secret',
    [],
    { API_TOKEN: "known-secret" },
  );
  for (const secret of [
    "unknown-token",
    "another-token",
    "plain-config-value",
    "quoted-config-value",
    "secret-config-line",
    "known-secret",
  ])
    expect(text).not.toContain(secret);
  expect(text).toContain("Authentication failed");
  expect(text).toContain("Service Binding target missing: backend-preview-1");
});
it("keeps nested error causes and terminates on cycles", () => {
  const error = new Error("fetch failed", { cause: new Error("ECONNRESET") });
  (error.cause as Error).cause = error;
  expect(errorDetail(error)).toContain(
    "Error: fetch failed; caused by: Error: ECONNRESET",
  );
});
it("retains both streams in failure summaries and bounds report size", () => {
  const result = {
    status: "completed" as const,
    code: 1,
    stdout: "Service Binding missing",
    stderr: "Authentication failed",
  };
  const detail = commandFailure(result, "Wrangler");
  expect(detail).toContain("exited 1");
  expect(detail).toContain(result.stdout);
  expect(detail).toContain(result.stderr);
  expect(
    commandFailure({ ...result, stdout: "x".repeat(4000) }, "Wrangler"),
  ).toContain("truncated; see execution log");
});
