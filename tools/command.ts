import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { diagnostic, StreamingDiagnostic } from "./diagnostics.js";
export type CommandResult =
  | { status: "completed"; code: number; stdout: string; stderr: string }
  | { status: "command-error"; reason: string; stdout: string; stderr: string };
export async function command(
  program: string,
  args: string[],
  cwd: string,
  quiet = false,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutDecoder = new StringDecoder("utf8"),
      stderrDecoder = new StringDecoder("utf8");
    const stdoutLog = new StreamingDiagnostic(env),
      stderrLog = new StreamingDiagnostic(env);
    let stdout = "",
      stderr = "",
      spawnError: string | undefined;
    const output = (value: string) => {
      stdout += value;
      if (!quiet) process.stderr.write(stdoutLog.push(value));
    };
    const error = (value: string) => {
      stderr += value;
      if (!quiet) process.stderr.write(stderrLog.push(value));
    };
    child.stdout!.on("data", (data: Buffer) =>
      output(stdoutDecoder.write(data)),
    );
    child.stderr!.on("data", (data: Buffer) =>
      error(stderrDecoder.write(data)),
    );
    child.on("error", (failure) => {
      spawnError = diagnostic(failure.message, [], env);
    });
    child.on("close", (code, signal) => {
      output(stdoutDecoder.end());
      error(stderrDecoder.end());
      if (!quiet) process.stderr.write(stdoutLog.finish() + stderrLog.finish());
      else if (code !== 0 || spawnError)
        process.stderr.write(diagnostic(stdout + stderr, [], env));
      resolve(
        spawnError || code === null
          ? {
              status: "command-error",
              reason:
                spawnError ??
                `Process terminated by ${signal ?? "unknown signal"}`,
              stdout,
              stderr,
            }
          : { status: "completed", code, stdout, stderr },
      );
    });
  });
}
