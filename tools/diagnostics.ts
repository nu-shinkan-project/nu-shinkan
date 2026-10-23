import { stripVTControlCharacters } from "node:util";
import type { CommandResult } from "./command.js";

/** Sanitize at the diagnostic boundary, never before parsing machine output. */
export function diagnostic(
  value: string,
  secrets: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): string {
  let text = stripVTControlCharacters(value);
  const values = [
    ...secrets,
    ...Object.entries(env)
      .filter(
        ([key, value]) =>
          value &&
          (value.length >= 4 || /token|secret|password|key/i.test(key)),
      )
      .map(([, value]) => value!),
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const secret of new Set(values))
    text = text.replaceAll(secret, "[REDACTED]");
  return (
    text
      .replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]")
      // Tool diagnostics may quote configuration contents or print Wrangler vars.
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "[REDACTED]")
      .replace(/(env\.[\w]+)[ \t]+[^\r\n]*/g, "$1 [REDACTED]")
      .replace(
        /((?:token|secret|password|api_key)\s*[:=]\s*)[^\s,;]+/gi,
        "$1[REDACTED]",
      )
      .replace(/^\s*\d+\s*[|│].*$/gm, "[REDACTED source excerpt]")
  );
}

export function errorDetail(
  error: unknown,
  secrets: string[] = [],
  includeStack = false,
): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  while (error !== undefined && !seen.has(error)) {
    seen.add(error);
    parts.push(
      error instanceof Error
        ? includeStack
          ? (error.stack ?? `${error.name}: ${error.message}`)
          : `${error.name}: ${error.message}`
        : String(error),
    );
    error = error instanceof Error ? error.cause : undefined;
  }
  return diagnostic(parts.join("; caused by: "), secrets);
}

export function commandFailure(run: CommandResult, label: string): string {
  const status = run.status === "completed" ? `exited ${run.code}` : run.reason;
  const detail = diagnostic(
    [run.stderr, run.stdout].filter(Boolean).join("\n"),
  ).trim();
  return `${label}: ${status}${detail ? `\n${detail.slice(0, 3000)}${detail.length > 3000 ? "\n[truncated; see execution log]" : ""}` : ""}`;
}
