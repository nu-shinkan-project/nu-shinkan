export type DeployChannel = "staging" | "release" | "preview";
export type Target = { path: string; workerName?: string };
export type Context = {
  channel: DeployChannel;
  prNumber: number;
  targets: ReadonlyMap<string, Target>;
  profile: "staging" | "release";
  workers?: ReadonlyMap<string, string>;
};

// Main Logic

export function parseContext(env: NodeJS.ProcessEnv = process.env): Context {
  const channel = parseChannel(env.DEPLOY_CHANNEL);
  const prNumber = parsePrNumber(env.PR_NUMBER, channel);
  const targets = parseTargets(env.TARGETS);
  const profile = resolveProfile(channel);

  return { channel, profile, prNumber, targets };
}

// Helper

function parseChannel(value: string | undefined): DeployChannel {
  if (value !== "staging" && value !== "release" && value !== "preview")
    throw new Error(
      "Invalid DEPLOY_CHANNEL; expected staging, release, or preview",
    );
  return value;
}

function parsePrNumber(
  value: string | undefined,
  channel: DeployChannel,
): number {
  // updateではPR番号を使用しないため、入力にかかわらず未使用値に揃える。
  if (channel !== "preview") return -1;
  const prNumber = Number(value);
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0)
    throw new Error("Invalid PR_NUMBER; preview requires a positive integer");
  return prNumber;
}

function parseTargets(value: string | undefined): ReadonlyMap<string, Target> {
  if (value === undefined)
    throw new Error("TARGETS is required; use [] for an empty selection");
  const targets: unknown = JSON.parse(value);
  if (
    !Array.isArray(targets) ||
    targets.some(
      (t) =>
        !t ||
        typeof t.package !== "string" ||
        !t.package ||
        typeof t.path !== "string" ||
        !t.path ||
        (t.workerName !== undefined &&
          (typeof t.workerName !== "string" || !t.workerName)) ||
        /(^|[\\/])\.\.([\\/]|$)|^[\\/]/.test(t.path),
    )
  )
    throw new Error("Invalid TARGETS; expected [{package,path,workerName?}]");
  const names = targets.map((target) => target.package);
  if (new Set(names).size !== names.length)
    throw new Error("Duplicate TARGETS package");
  return new Map(
    targets.map(({ package: name, path, workerName }) => [
      name,
      workerName === undefined ? { path } : { path, workerName },
    ]),
  );
}

function resolveProfile(channel: DeployChannel): Context["profile"] {
  return channel === "release" ? "release" : "staging";
}
