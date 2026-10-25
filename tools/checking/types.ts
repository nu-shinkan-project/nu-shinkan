export type Check = {
  package: string;
  task: string;
  status: "passed" | "failed" | "execution-error" | "no-script";
  cached: boolean;
  reason?: string;
};
export type Checks = { status: "passed" | "checks-failed"; results: Check[] };
