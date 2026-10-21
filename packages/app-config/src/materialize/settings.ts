import {
  DeploymentYaml,
  type Deployment,
  type Variables,
} from "../config-file/deployment.yaml.js";
import { GlobalRuntimeEnvsYaml } from "../config-file/globalRuntimeEnvs.yaml.js";
import type { Context } from "./context.js";
export type Settings = {
  deployment: Deployment;
  overrides: Variables;
};
// Main Logic

export function readSettings(context: Context, packagePath?: string): Settings {
  const deployment = new DeploymentYaml(packagePath);
  const { profile } = context;
  return {
    deployment,
    // 共有設定より、そのパッケージ固有の設定を優先する。
    overrides: {
      ...new GlobalRuntimeEnvsYaml().variablesFor(profile),
      ...deployment.envs[profile],
    },
  };
}
