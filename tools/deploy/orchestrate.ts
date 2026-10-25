import type {
  Request,
  ExecutionContext,
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
  checks(plan: Plan, context: ExecutionContext): Promise<Checks>;
  configure(
    plan: Plan,
    request: Request,
    context: ExecutionContext,
  ): Promise<Configuration>;
  build(plan: Plan, context: ExecutionContext): Promise<Builds>;
  deploy(plan: Plan, context: ExecutionContext): Promise<Deployments>;
  report(state: State): Promise<Report>;
};

export async function orchestrate(
  request: Request,
  operations: Operations,
): Promise<Outcome> {
  const planning = await operations.plan(request);
  const state: State = {
    request,
    planning:
      planning.status === "planned"
        ? { status: "planned", plan: planning.plan }
        : planning,
    status: "success",
  };
  if (planning.status !== "planned") {
    state.status = "failure";
    state.stopped = { phase: "plan", reason: planning.reason };
  } else {
    await prepareAndDeploy(state, planning.plan, planning.context, operations);
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
  context: ExecutionContext,
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
  state.checks = await operations.checks(plan, context);
  if (state.checks.status === "checks-failed")
    return stop("checks", "One or more checks failed");
  if (!plan.targets.length) return;
  state.configuration = await operations.configure(
    plan,
    state.request,
    context,
  );
  if (state.configuration.status === "configuration-failed")
    return stop("configuration", state.configuration.reason);
  if (plan.builds.length) {
    state.builds = await operations.build(plan, context);
    if (state.builds.status === "build-failed")
      return stop("build", "One or more builds failed");
  }
  if (plan.deploys.length) {
    state.deployments = await operations.deploy(plan, context);
    state.status = state.deployments.status;
  }
}
