import type { PlannedConnection } from "./connection-plan.js";
import type { Package } from "../workspace/types.js";
import type { Check, Checks } from "../checking/types.js";
export type { Check, Checks } from "../checking/types.js";
export type Channel = "preview" | "staging" | "release";
export type Source = "diff" | "full" | "manual-pick";
type RequestContext = {
  commit: string;
  base: string | null;
  packages: string[];
};
export type Request = RequestContext &
  (
    | {
        channel: "preview";
        purpose: "review";
        profile: "staging";
        source: Source;
        prNumber: number;
      }
    | {
        channel: "staging";
        purpose: "update";
        profile: "staging";
        source: "diff" | "full";
        prNumber: -1;
      }
    | {
        channel: "release";
        purpose: "update";
        profile: "release";
        source: "diff" | "full";
        prNumber: -1;
      }
  );
export type Plan = {
  initialSource: Source;
  source: Source;
  fallback?: string;
  origins: string[];
  affected: string[];
  targets: string[];
  builds: string[];
  deploys: string[];
  warnings: string[];
  connections: PlannedConnection[];
};
export type ExecutionContext = { packages: ReadonlyMap<string, Package> };
export type Planning =
  | { status: "planned"; plan: Plan; context: ExecutionContext }
  | {
      status: "invalid" | "unavailable";
      reason: string;
      unknownPackages: string[];
    };
export type Sync =
  { status: "synced" } | { status: "sync-failed"; reason: string };
export type Configuration =
  | { status: "generated" }
  | {
      status: "configuration-failed";
      reason: string;
      package?: string;
      resource?: { kind: string; name: string };
    };
export type Builds = { status: "built" | "build-failed"; results: Check[] };
export type Deployment = {
  package: string;
  status: "deployed" | "deploy-failed";
  url?: string;
  reason?: string;
};
export type Deployments = {
  status: "success" | "partial-failure" | "failure";
  results: Deployment[];
};
export type State = {
  request: Request;
  planning:
    | Exclude<Planning, { status: "planned" }>
    | { status: "planned"; plan: Plan };
  sync?: Sync;
  checks?: Checks;
  configuration?: Configuration;
  builds?: Builds;
  deployments?: Deployments;
  status: "success" | "partial-failure" | "failure";
  stopped?: { phase: string; reason: string };
};
export type Report =
  | { status: "written"; path: string }
  | { status: "report-failed"; reason: string };
export type Outcome = { state: State; report: Report; exitCode: number };
