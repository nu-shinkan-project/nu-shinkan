import { cwd } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DotenvVariables = { [key: string]: string };

// Main Logic

/**
 * パッケージ内の設定ドキュメント。初回参照時に読み込み、インスタンス内に保持する。
 * 取得値は独立したスナップショット。外部の更新を読む場合は新しいインスタンスを作る。
 * 編集はメモリ上で行い、保存メソッドを呼ぶまでファイルには反映しない。
 */
export class Dotenv {
  private src: string;
  private content?: string;

  constructor(packagePath: string = cwd()) {
    this.src = resolve(packagePath, ".env.development");
  }

  exists(): boolean {
    return existsSync(this.src);
  }

  private get document(): string {
    return (this.content ??= readFileSync(this.src, "utf-8"));
  }

  get variables(): DotenvVariables {
    const content = this.document;
    const lines = content.split("\n");
    const result: DotenvVariables = {};
    for (const line of lines) {
      const equal = line.indexOf("=");
      if (equal < 0 || line.trimStart().startsWith("#")) continue;
      const key = line.slice(0, equal).trim();
      const value = line.slice(equal + 1).trim();

      // pick only VITE_ prefixed variables
      if (!key.startsWith("VITE_")) continue;

      // remove prefix as key
      const unprefixedKey = key.slice("VITE_".length);
      result[unprefixedKey] = value;
    }
    return result;
  }

  updateVariables(values: Record<string, string | null | undefined>): void {
    const prefixed = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key.startsWith("VITE_") ? key : `VITE_${key}`,
        value,
      ]),
    );
    this.content = patch(this.document, prefixed);
  }

  derive(path: string): Dotenv {
    return Dotenv.fromVariables(
      resolve(dirname(this.src), path),
      this.variables,
    );
  }

  static fromVariables(path: string, variables: DotenvVariables): Dotenv {
    const derived = new Dotenv(dirname(path));
    derived.src = resolve(path);
    derived.content = Object.entries(variables)
      .map(([key, value]) => {
        const quoted = /^("|')[\s\S]*\1$/.test(value);
        return `VITE_${key}=${quoted ? value : JSON.stringify(value)}`;
      })
      .join("\n");
    return derived;
  }

  save(dryRun = false): void {
    if (dryRun) {
      console.log(`[dry-run] would save ${this.src}:\n${this.document}`);
    } else {
      mkdirSync(dirname(this.src), { recursive: true });
      writeFileSync(this.src, this.document, "utf-8");
    }
  }
}

// Helper

function patch(
  original: string,
  values: Record<string, string | null | undefined>,
): string {
  const remaining = new Set(Object.keys(values));
  const result: string[] = [];
  // コメントと対象外の行を保持し、指定キーの重複は一つにまとめる。
  for (const line of original.split("\n")) {
    const equal = line.indexOf("=");
    const key = line.slice(0, equal).trim();
    if (
      equal < 0 ||
      line.trimStart().startsWith("#") ||
      !Object.hasOwn(values, key) ||
      values[key] === undefined
    ) {
      result.push(line);
      continue;
    }
    if (remaining.has(key) && values[key] !== null)
      result.push(`${key}=${values[key]}`);
    remaining.delete(key);
  }
  // nullは削除指示。新規キーでもnull自体を書き込まない。
  for (const key of remaining)
    if (values[key] !== null && values[key] !== undefined)
      result.push(`${key}=${values[key]}`);
  return result.join("\n");
}
export const testExports = {
  patch,
};
