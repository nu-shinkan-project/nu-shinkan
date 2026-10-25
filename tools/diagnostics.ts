import { stripVTControlCharacters } from "node:util";
import type { CommandResult } from "./command.js";

/** Sanitize at the diagnostic boundary, never before parsing machine output. */
export function diagnostic(
  value: string,
  secrets: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): string {
  let text = stripVTControlCharacters(value);
  for (const secret of new Set(secretValues(secrets, env)))
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

function secretValues(secrets: string[], env: NodeJS.ProcessEnv): string[] {
  return [
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
}

/** Keep incomplete lines, secrets and quoted values until they can be masked as a whole. */
export class StreamingDiagnostic {
  private pending = "";
  private control = "";
  private readonly env: NodeJS.ProcessEnv;
  private readonly secrets: string[];
  private readonly tail: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = { ...env };
    this.secrets = secretValues([], this.env);
    this.tail = Math.max(1, ...this.secrets.map((value) => value.length)) - 1;
  }

  push(value: string): string {
    const input = this.control + value;
    // VT sequences may themselves be split between stream chunks. Normalize complete sequences only.
    const incomplete =
      input.match(
        // eslint-disable-next-line no-control-regex -- recognize incomplete VT control sequences
        /(?:\x1b(?:\[[0-?]*[ -/]*|\][^\x07\x1b]*(?:\x1b)?|[()][0-2]?|[#%]?)?|\u009b[0-?]*[ -/]*)$/,
      )?.[0] ?? "";
    this.control = incomplete;
    this.pending += stripVTControlCharacters(
      input.slice(0, input.length - incomplete.length),
    );
    const lineBoundary = (position: number) =>
      position < 0 ? 0 : this.pending.lastIndexOf("\n", position) + 1;
    let boundary = lineBoundary(this.pending.length - this.tail - 1);
    // A complete multiline secret or quoted value must not straddle the released prefix.
    let previous: number;
    do {
      previous = boundary;
      for (const secret of this.secrets) {
        let start = this.pending.indexOf(secret);
        while (start >= 0 && start < boundary) {
          if (start + secret.length > boundary) boundary = start;
          start = this.pending.indexOf(secret, start + 1);
        }
      }
      // These diagnostic patterns can begin on one line and finish on the next.
      for (const pattern of [
        /Bearer\s+\S*/gi,
        /(?:token|secret|password|api_key)\s*(?:[:=]\s*[^\s,;]*)?/gi,
        /(?:^|\n)\s*\d+\s*(?:[|│][^\r\n]*)?/g,
      ]) {
        for (const match of this.pending.matchAll(pattern))
          if (
            match.index < boundary &&
            match.index + match[0].length >= boundary
          )
            boundary = match.index;
      }
      for (let index = 0; index < boundary; index++) {
        const quote = this.pending[index];
        if (quote !== '"' && quote !== "'") continue;
        const start = index++;
        while (index < this.pending.length && this.pending[index] !== quote) {
          if (this.pending[index] === "\\") index++;
          index++;
        }
        if (index >= boundary) {
          boundary = start;
          break;
        }
      }
      boundary = lineBoundary(boundary - 1);
    } while (boundary !== previous);
    const output = diagnostic(this.pending.slice(0, boundary), [], this.env);
    this.pending = this.pending.slice(boundary);
    return output;
  }

  finish(): string {
    const output = diagnostic(this.pending + this.control, [], this.env);
    this.pending = "";
    this.control = "";
    return output;
  }
}
