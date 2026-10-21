import { spawn } from "node:child_process";
export type CommandResult =
  | { status: "completed"; code: number; stdout: string }
  | { status: "command-error"; reason: string; stdout: string };
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
      stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
    });
    let stdout = "";
    child.stderr?.resume();
    child.stdout!.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (!quiet) process.stdout.write(data);
    });
    child.on("error", (error) =>
      resolve({ status: "command-error", reason: error.message, stdout }),
    );
    child.on("close", (code) =>
      resolve(
        code === null
          ? {
              status: "command-error",
              reason: "Process terminated without an exit code",
              stdout,
            }
          : { status: "completed", code, stdout },
      ),
    );
  });
}
