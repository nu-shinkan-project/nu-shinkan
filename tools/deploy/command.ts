import { spawn } from "node:child_process";
import { diagnostic } from "./diagnostics.js";
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
    let stdout = "";
    let stderr = "";
    child.stderr!.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.stdout!.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.on("error", (error) =>
      resolve({
        status: "command-error",
        reason: diagnostic(error.message, [], env),
        stdout,
        stderr,
      }),
    );
    child.on("close", (code, signal) => {
      // Buffer before masking so secrets split across stream chunks remain hidden.
      if (!quiet || code !== 0) {
        process.stderr.write(diagnostic(stdout + stderr, [], env));
      }
      resolve(
        code === null
          ? {
              status: "command-error",
              reason: `Process terminated by ${signal ?? "unknown signal"}`,
              stdout,
              stderr,
            }
          : { status: "completed", code, stdout, stderr },
      );
    });
  });
}
