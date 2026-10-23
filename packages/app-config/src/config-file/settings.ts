import { DeploymentYaml } from "./deployment.yaml.js";
import { GlobalRuntimeEnvsYaml } from "./globalRuntimeEnvs.yaml.js";
import type { Variables } from "./deployment.yaml.js";

/** Package settings combined with the shared values for one profile. */
export class DeploymentSettings {
  readonly deployment: DeploymentYaml;
  private readonly values: Variables;

  constructor(packagePath: string, profile: "staging" | "release") {
    this.deployment = new DeploymentYaml(packagePath);
    this.values = {
      ...new GlobalRuntimeEnvsYaml().variablesFor(profile),
      ...this.deployment.envs[profile],
    };
  }

  get overrides(): Variables {
    return { ...this.values };
  }
}
