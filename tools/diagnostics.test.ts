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

import { StreamingDiagnostic } from "./diagnostics.js";
it.each([
  "a-secret-value",
  "first\nsecond\nthird",
  "\nfirst\nsecond",
  "秘密のトークン",
])("keeps %j masked at every possible chunk boundary", (secret) => {
  const source = `progress\n${secret}\nfinished\n`;
  for (let split = 0; split <= source.length; split++) {
    const log = new StreamingDiagnostic({ API_TOKEN: secret });
    const output =
      log.push(source.slice(0, split)) +
      log.push(source.slice(split)) +
      log.finish();
    expect(output).not.toContain(secret);
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("progress");
    expect(output).toContain("finished");
  }
});
it("emits safe progress before completion and masks split credentials, snippets and ANSI sequences", () => {
  const log = new StreamingDiagnostic({ API_TOKEN: "known-secret" });
  let output = log.push("working\ncontinuing\nmore progress\n");
  expect(output).toContain("working");
  const chunks = [
    "Bearer unknown-",
    "token\nAPI_TOKEN=another-",
    'token\nenv.KEY secret-value\nconfig: "private\n',
    'multiline value"\n 3 │ source-secret\n',
    "\u001b[3",
    "1mknown-",
    "secret\u001b[",
    "0m\ncomplete\n",
  ];
  for (const chunk of chunks) output += log.push(chunk);
  output += log.finish();
  for (const secret of [
    "unknown-token",
    "another-token",
    "secret-value",
    "private",
    "multiline value",
    "source-secret",
    "known-secret",
  ])
    expect(output).not.toContain(secret);
  expect(output).toContain("complete");
  expect(output).not.toContain("\u001b");
  expect(log.finish()).toBe("");
});
it("does not expose a multiline secret across a released line boundary", () => {
  const log = new StreamingDiagnostic({ TOKEN: "first\nsecond" });
  const first = log.push("before\nfirst\nsecond\nafter\nxxxxxxxxxxxxxxxx\n");
  const output = first + log.finish();
  expect(output).not.toContain("first");
  expect(output).not.toContain("second");
  expect(output).toContain("before");
  expect(output).toContain("after");
});

it("keeps multiline credential markers and source excerpt prefixes until their values can be masked", () => {
  const source =
    "Bearer\nunknown-token\npassword\n=\nprivate-value\n3\n│ source-secret\nfinished\n";
  for (let split = 0; split <= source.length; split++) {
    const log = new StreamingDiagnostic({});
    const output =
      log.push(source.slice(0, split)) +
      log.push(source.slice(split)) +
      log.finish();
    for (const secret of ["unknown-token", "private-value", "source-secret"])
      expect(output).not.toContain(secret);
    expect(output).toContain("finished");
  }
});
