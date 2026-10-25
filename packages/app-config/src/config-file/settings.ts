import { DeploymentYaml, type Deployment } from "./deployment.yaml.js";
import { GlobalRuntimeEnvsYaml } from "./globalRuntimeEnvs.yaml.js";
import type { Variables } from "./deployment.yaml.js";

/** Package settings combined with the shared values for one profile. */
export class DeploymentSettings {
  readonly deployment: Deployment;
  private readonly values: Variables;

  constructor(
    packagePath: string | Deployment,
    profile: "staging" | "release",
    shared?: Variables,
  ) {
    this.deployment =
      typeof packagePath === "string"
        ? new DeploymentYaml(packagePath)
        : structuredClone({
            envs: packagePath.envs,
            connections: packagePath.connections,
            reviewEntry: packagePath.reviewEntry,
          });
    this.values = {
      ...(shared ?? new GlobalRuntimeEnvsYaml().variablesFor(profile)),
      ...this.deployment.envs[profile],
    };
  }

  get overrides(): Variables {
    return { ...this.values };
  }
}
