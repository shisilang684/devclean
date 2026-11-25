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

// Build paths with the semantics of the target platform, not the host, so the
// same environment object produces the same paths on any machine.
const envPath = (env: Env) => (isWin(env) ? path.win32 : path.posix);
const joinPath = (env: Env, ...parts: string[]) => envPath(env).join(...parts);

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
        platformPath(env, joinPath(env, env.localAppData, "npm-cache"), joinPath(env, env.home, ".npm"), joinPath(env, env.home, ".npm"));
      return [joinPath(env, base, "_cacache")];
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
          joinPath(env, env.localAppData, "pnpm", "store"),
          joinPath(env, env.home, "Library", "pnpm", "store"),
          joinPath(env, env.home, ".local", "share", "pnpm", "store"),
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
          joinPath(env, env.localAppData, "Yarn", "Cache"),
          joinPath(env, env.home, "Library", "Caches", "Yarn"),
          joinPath(env, env.home, ".cache", "yarn"),
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
      return [joinPath(env, env.home, ".bun", "install", "cache")];
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
          joinPath(env, env.localAppData, "pip", "Cache"),
          joinPath(env, env.home, "Library", "Caches", "pip"),
          joinPath(env, env.home, ".cache", "pip"),
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
          joinPath(env, env.localAppData, "uv", "cache"),
          joinPath(env, env.home, "Library", "Caches", "uv"),
          joinPath(env, env.home, ".cache", "uv"),
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
      return [joinPath(env, env.home, ".cargo", "registry"), joinPath(env, env.home, ".cargo", "git")];
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
          joinPath(env, env.localAppData, "go-build"),
          joinPath(env, env.home, "Library", "Caches", "go-build"),
          joinPath(env, env.home, ".cache", "go-build"),
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
      return [joinPath(env, env.home, ".gradle", "caches")];
    },
  },
  {
    id: "maven",
    name: "Maven repo",
    risk: "medium",
    note: "Local Maven repository. Safe to delete, but large to re-download.",
    paths(env) {
      return [joinPath(env, env.home, ".m2", "repository")];
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
          joinPath(env, env.localAppData, "ms-playwright"),
          joinPath(env, env.home, "Library", "Caches", "ms-playwright"),
          joinPath(env, env.home, ".cache", "ms-playwright"),
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
      return [joinPath(env, env.home, ".cache", "puppeteer")];
    },
  },
  {
    id: "huggingface",
    name: "Hugging Face models",
    risk: "medium",
    note: "Model and dataset cache. Deleted models are re-downloaded on next use.",
    paths(env) {
      if (env.vars.HF_HOME) return [joinPath(env, env.vars.HF_HOME, "hub")];
      return [joinPath(env, env.home, ".cache", "huggingface", "hub")];
    },
  },
  {
    id: "ollama",
    name: "Ollama models",
    risk: "high",
    note: "Downloaded local LLM weights. Deleting forces a full re-pull.",
    paths(env) {
      const list = [joinPath(env, env.home, ".ollama", "models")];
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
      return [joinPath(env, env.home, ".lmstudio", "models"), joinPath(env, env.home, ".cache", "lm-studio", "models")];
    },
  },
  {
    id: "nuget",
    name: "NuGet packages",
    risk: "medium",
    note: "Global package folder shared by .NET projects. dotnet restore fetches it again.",
    paths(env) {
      return [joinPath(env, env.home, ".nuget", "packages")];
    },
  },
  {
    id: "conda",
    name: "Conda packages",
    risk: "medium",
    note: "Package archives extracted into conda environments. Existing envs may share these files.",
    paths(env) {
      const roots = ["miniconda3", "anaconda3", "miniforge3", "mambaforge"];
      const list = roots.map((root) => joinPath(env, env.home, root, "pkgs"));
      list.push(joinPath(env, env.localAppData, "conda", "pkgs"));
      return list;
    },
  },
  {
    id: "sbt",
    name: "sbt / Ivy cache",
    risk: "low",
    note: "Scala and Java dependencies downloaded by sbt.",
    paths(env) {
      return [joinPath(env, env.home, ".ivy2", "cache"), joinPath(env, env.home, ".sbt", "boot")];
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
          joinPath(env, env.localAppData, "deno"),
          joinPath(env, env.home, "Library", "Caches", "deno"),
          joinPath(env, env.home, ".cache", "deno"),
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
          joinPath(env, env.localAppData, "Cypress", "Cache"),
          joinPath(env, env.home, "Library", "Caches", "Cypress"),
          joinPath(env, env.home, ".cache", "Cypress"),
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
          joinPath(env, env.localAppData, "electron", "Cache"),
          joinPath(env, env.home, "Library", "Caches", "electron"),
          joinPath(env, env.home, ".cache", "electron"),
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
          joinPath(env, env.localAppData, "Composer", "Cache"),
          joinPath(env, env.home, "Library", "Caches", "composer"),
          joinPath(env, env.home, ".cache", "composer"),
        ),
      ];
    },
  },
];

export function adapterById(id: string): Adapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id);
}