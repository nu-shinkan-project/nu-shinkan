import type {
  Request,
  Planning,
  Plan,
  Sync,
  Checks,
  Configuration,
  Builds,
  Deployments,
  State,
  Report,
  Outcome,
} from "./types.js";

export type Operations = {
  plan(request: Request): Promise<Planning>;
  sync(): Promise<Sync>;
  checks(plan: Plan): Promise<Checks>;
  configure(plan: Plan, request: Request): Promise<Configuration>;
  build(plan: Plan): Promise<Builds>;
  deploy(plan: Plan): Promise<Deployments>;
  report(state: State): Promise<Report>;
};

export async function orchestrate(
  request: Request,
  operations: Operations,
): Promise<Outcome> {
  const planning = await operations.plan(request);
  const state: State = { request, planning, status: "success" };
  if (planning.status !== "planned") {
    state.status = "failure";
    state.stopped = { phase: "plan", reason: planning.reason };
  } else {
    await prepareAndDeploy(state, planning.plan, operations);
  }
  const report = await operations.report(state);
  return {
    state,
    report,
    exitCode: state.status === "success" && report.status === "written" ? 0 : 1,
  };
}

async function prepareAndDeploy(
  state: State,
  plan: Plan,
  operations: Operations,
): Promise<void> {
  if (!plan.affected.length && !plan.targets.length) return;
  const stop = (phase: string, reason: string) => {
    state.status = "failure";
    state.stopped = { phase, reason };
  };
  state.sync = await operations.sync();
  if (state.sync.status === "sync-failed")
    return stop("sync", state.sync.reason);
  state.checks = await operations.checks(plan);
  if (state.checks.status === "checks-failed")
    return stop("checks", "One or more checks failed");
  if (!plan.targets.length) return;
  state.configuration = await operations.configure(plan, state.request);
  if (state.configuration.status === "configuration-failed")
    return stop("configuration", state.configuration.reason);
  if (plan.builds.length) {
    state.builds = await operations.build(plan);
    if (state.builds.status === "build-failed")
      return stop("build", "One or more builds failed");
  }
  if (plan.deploys.length) {
    state.deployments = await operations.deploy(plan);
    state.status = state.deployments.status;
  }
}
