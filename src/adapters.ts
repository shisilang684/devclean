import os from "node:os";
import path from "node:path";

export type Risk = "low" | "medium" | "high";

export interface Env {
  platform: NodeJS.Platform;
  home: string;
  localAppData: string;
  appData: string;
  vars: NodeJS.ProcessEnv;
}

export interface CacheCandidate {
  id: string;
  name: string;
  path: string;
  risk: Risk;
  note: string;
}

export interface Adapter {
  id: string;
  name: string;
  risk: Risk;
  note: string;
  paths(env: Env): string[];
}

export function detectEnv(): Env {
  const home = os.homedir();
  return {
    platform: process.platform,
    home,
    localAppData: process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
    appData: process.env.APPDATA || path.join(home, "AppData", "Roaming"),
    vars: process.env,
  };
}

const isWin = (env: Env) => env.platform === "win32";
const isMac = (env: Env) => env.platform === "darwin";

function platformPath(env: Env, win: string, mac: string, linux: string): string {
  if (isWin(env)) return win;
  if (isMac(env)) return mac;
  return linux;
}

export const ADAPTERS: Adapter[] = [
  {
    id: "npm",
    name: "npm cache",
    risk: "low",
    note: "Downloaded package tarballs. npm re-downloads what it needs.",
    paths(env) {
      const base =
        env.vars.npm_config_cache ||
        platformPath(env, path.join(env.localAppData, "npm-cache"), path.join(env.home, ".npm"), path.join(env.home, ".npm"));
      return [path.join(base, "_cacache")];
    },
  },
  {
    id: "pnpm",
    name: "pnpm store",
    risk: "low",
    note: "Content-addressed package store shared by your pnpm projects.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "pnpm", "store"),
          path.join(env.home, "Library", "pnpm", "store"),
          path.join(env.home, ".local", "share", "pnpm", "store"),
        ),
      ];
    },
  },
  {
    id: "yarn",
    name: "Yarn cache",
    risk: "low",
    note: "Yarn's global package cache.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "Yarn", "Cache"),
          path.join(env.home, "Library", "Caches", "Yarn"),
          path.join(env.home, ".cache", "yarn"),
        ),
      ];
    },
  },
  {
    id: "bun",
    name: "Bun cache",
    risk: "low",
    note: "Bun's install cache.",
    paths(env) {
      return [path.join(env.home, ".bun", "install", "cache")];
    },
  },
  {
    id: "pip",
    name: "pip cache",
    risk: "low",
    note: "Python wheel and HTTP cache. pip re-downloads on demand.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "pip", "Cache"),
          path.join(env.home, "Library", "Caches", "pip"),
          path.join(env.home, ".cache", "pip"),
        ),
      ];
    },
  },
  {
    id: "uv",
    name: "uv cache",
    risk: "low",
    note: "uv's package and wheel cache.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "uv", "cache"),
          path.join(env.home, "Library", "Caches", "uv"),
          path.join(env.home, ".cache", "uv"),
        ),
      ];
    },
  },
  {
    id: "cargo",
    name: "Cargo registry",
    risk: "low",
    note: "Crates downloaded by Cargo. Rebuilt from crates.io when needed.",
    paths(env) {
      return [path.join(env.home, ".cargo", "registry"), path.join(env.home, ".cargo", "git")];
    },
  },
  {
    id: "go",
    name: "Go build cache",
    risk: "low",
    note: "Compiled package cache used by the Go toolchain.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "go-build"),
          path.join(env.home, "Library", "Caches", "go-build"),
          path.join(env.home, ".cache", "go-build"),
        ),
      ];
    },
  },
  {
    id: "gradle",
    name: "Gradle caches",
    risk: "low",
    note: "Dependency and build caches under ~/.gradle/caches.",
    paths(env) {
      return [path.join(env.home, ".gradle", "caches")];
    },
  },
  {
    id: "maven",
    name: "Maven repo",
    risk: "medium",
    note: "Local Maven repository. Safe to delete, but large to re-download.",
    paths(env) {
      return [path.join(env.home, ".m2", "repository")];
    },
  },
  {
    id: "playwright",
    name: "Playwright browsers",
    risk: "low",
    note: "Browser binaries downloaded by Playwright. Reinstall with npx playwright install.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "ms-playwright"),
          path.join(env.home, "Library", "Caches", "ms-playwright"),
          path.join(env.home, ".cache", "ms-playwright"),
        ),
      ];
    },
  },
  {
    id: "puppeteer",
    name: "Puppeteer browsers",
    risk: "low",
    note: "Chrome builds downloaded by Puppeteer.",
    paths(env) {
      return [path.join(env.home, ".cache", "puppeteer")];
    },
  },
  {
    id: "huggingface",
    name: "Hugging Face models",
    risk: "medium",
    note: "Model and dataset cache. Deleted models are re-downloaded on next use.",
    paths(env) {
      if (env.vars.HF_HOME) return [path.join(env.vars.HF_HOME, "hub")];
      return [path.join(env.home, ".cache", "huggingface", "hub")];
    },
  },
  {
    id: "ollama",
    name: "Ollama models",
    risk: "high",
    note: "Downloaded local LLM weights. Deleting forces a full re-pull.",
    paths(env) {
      const list = [path.join(env.home, ".ollama", "models")];
      if (!isWin(env) && !isMac(env)) list.push("/usr/share/ollama/.ollama/models");
      return list;
    },
  },
  {
    id: "lmstudio",
    name: "LM Studio models",
    risk: "high",
    note: "Downloaded local LLM weights. Deleting forces a full re-download.",
    paths(env) {
      return [path.join(env.home, ".lmstudio", "models"), path.join(env.home, ".cache", "lm-studio", "models")];
    },
  },
  {
    id: "nuget",
    name: "NuGet packages",
    risk: "medium",
    note: "Global package folder shared by .NET projects. dotnet restore fetches it again.",
    paths(env) {
      return [path.join(env.home, ".nuget", "packages")];
    },
  },
  {
    id: "conda",
    name: "Conda packages",
    risk: "medium",
    note: "Package archives extracted into conda environments. Existing envs may share these files.",
    paths(env) {
      const roots = ["miniconda3", "anaconda3", "miniforge3", "mambaforge"];
      const list = roots.map((root) => path.join(env.home, root, "pkgs"));
      list.push(path.join(env.localAppData, "conda", "pkgs"));
      return list;
    },
  },
  {
    id: "sbt",
    name: "sbt / Ivy cache",
    risk: "low",
    note: "Scala and Java dependencies downloaded by sbt.",
    paths(env) {
      return [path.join(env.home, ".ivy2", "cache"), path.join(env.home, ".sbt", "boot")];
    },
  },
  {
    id: "deno",
    name: "Deno cache",
    risk: "low",
    note: "Remote modules and generated types. Fetched again on next run.",
    paths(env) {
      const dir =
        env.vars.DENO_DIR ||
        platformPath(
          env,
          path.join(env.localAppData, "deno"),
          path.join(env.home, "Library", "Caches", "deno"),
          path.join(env.home, ".cache", "deno"),
        );
      return [dir];
    },
  },
  {
    id: "cypress",
    name: "Cypress binary cache",
    risk: "low",
    note: "Downloaded Cypress app binaries. Reinstalled by cypress install.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "Cypress", "Cache"),
          path.join(env.home, "Library", "Caches", "Cypress"),
          path.join(env.home, ".cache", "Cypress"),
        ),
      ];
    },
  },
  {
    id: "electron",
    name: "Electron cache",
    risk: "low",
    note: "Electron runtime downloads used by electron-builder and electron.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "electron", "Cache"),
          path.join(env.home, "Library", "Caches", "electron"),
          path.join(env.home, ".cache", "electron"),
        ),
      ];
    },
  },
  {
    id: "composer",
    name: "Composer cache",
    risk: "low",
    note: "PHP package archives downloaded by Composer.",
    paths(env) {
      return [
        platformPath(
          env,
          path.join(env.localAppData, "Composer", "Cache"),
          path.join(env.home, "Library", "Caches", "composer"),
          path.join(env.home, ".cache", "composer"),
        ),
      ];
    },
  },
];

export function adapterById(id: string): Adapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id);
}