import { cwd } from "node:process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  applyEdits,
  modify as modifyJsonc,
  parse as parseJsonc,
} from "jsonc-parser";
import { dirname, resolve } from "node:path";

import type { WranglerConfig, WranglerPatch } from "./wrangler-types.js";
import { WranglerJson } from "./wrangler.json.js";
export { WranglerJson } from "./wrangler.json.js";
export type {
  WranglerConfig,
  WranglerPatch,
  D1Database,
  R2Bucket,
} from "./wrangler-types.js";

// Main Logic

/**
 * パッケージ内の設定ドキュメント。初回参照時に読み込み、インスタンス内に保持する。
 * 取得値は独立したスナップショット。外部の更新を読む場合は新しいインスタンスを作る。
 * 編集はメモリ上で行い、保存メソッドを呼ぶまでファイルには反映しない。
 */
export class WranglerJsonc {
  private readonly src: string;
  private content?: string;

  constructor(packagePath: string = cwd()) {
    this.src = resolve(packagePath, "wrangler.jsonc");
  }

  exists(): boolean {
    return existsSync(this.src);
  }

  private get document(): string {
    return (this.content ??= readFileSync(this.src, "utf-8"));
  }

  /** 呼び出し側が変更しても編集中の内容に影響しないスナップショット。 */
  get data(): WranglerConfig {
    return parseJsonc(this.document) as WranglerConfig;
  }

  get name(): string {
    return this.data.name;
  }

  get variables(): Record<string, string> {
    return this.data.vars ?? {};
  }

  get services(): NonNullable<WranglerConfig["services"]> {
    return this.data.services ?? [];
  }

  update(values: WranglerPatch): void {
    this.content = patch(this.document, values);
  }

  derive(path: string): WranglerJson {
    return new WranglerJson(resolve(dirname(this.src), path), this.data);
  }

  save(dryRun = false): void {
    if (dryRun) {
      console.log(`[dry-run] would save ${this.src}:\n${this.document}`);
    } else {
      writeFileSync(this.src, this.document, "utf-8");
    }
  }
}

// Helper

function patch(original: string, values: WranglerPatch): string {
  const originalModel = parseJsonc(original) as WranglerConfig;

  const formattingOptions = {
    insertSpaces: true,
    tabSize: 2,
  };
  const { name, vars, env, services, ...rest } = values;

  // JSONCのコメントを保つため、全体を再生成せず変更箇所だけ編集する。
  if (name !== undefined) {
    const nextEdits = modifyJsonc(original, ["name"], name, {
      formattingOptions,
    });
    original = applyEdits(original, nextEdits);
  }
  if (vars !== undefined) {
    for (const [key, value] of Object.entries(vars)) {
      const nextEdits = modifyJsonc(
        original,
        ["vars", key],
        value === null ? undefined : value,
        {
          formattingOptions,
        },
      );
      original = applyEdits(original, nextEdits);
    }
  }
  if (env !== undefined) {
    for (const [key, value] of Object.entries(env)) {
      const nextEdits = modifyJsonc(original, ["env", key], value, {
        formattingOptions,
      });
      original = applyEdits(original, nextEdits);
    }
  }

  // Binding名で照合することで、既存の順序と他の属性を保持する。
  const serviceBindingMap = (services ?? []).reduce(
    (acc, { binding, service }) => {
      acc[binding] = service;
      return acc;
    },
    {} as Record<string, string>,
  );
  for (const service of originalModel.services ?? []) {
    if (Object.keys(serviceBindingMap).includes(service.binding)) {
      // override
      const nextEdits = modifyJsonc(
        original,
        ["services", originalModel.services!.indexOf(service), "service"],
        serviceBindingMap[service.binding],
        {
          formattingOptions,
        },
      );
      original = applyEdits(original, nextEdits);
      delete serviceBindingMap[service.binding];
    }
  }
  // 既存Bindingに対応しなかった接続だけを末尾に追加する。
  let length_count = (originalModel.services ?? []).length;
  for (const [binding, service] of Object.entries(serviceBindingMap)) {
    const nextEdits = modifyJsonc(
      original,
      ["services", length_count, "binding"],
      binding,
      {
        formattingOptions,
      },
    );
    original = applyEdits(original, nextEdits);

    const nextEditsService = modifyJsonc(
      original,
      ["services", length_count, "service"],
      service,
      {
        formattingOptions,
      },
    );
    original = applyEdits(original, nextEditsService);
    length_count++;
  }

  // patch the rest of the fields last
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    const nextEdits = modifyJsonc(original, [key], value, {
      formattingOptions,
    });
    original = applyEdits(original, nextEdits);
  }

  return original;
}
export const testExports = {
  patch,
};
