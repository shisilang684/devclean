import { promises as fs } from "node:fs";
import path from "node:path";
import type { Env, Risk } from "./adapters.js";

export interface ExtraCache {
  id: string;
  name: string;
  path: string;
  risk: Risk;
  note: string;
}

export interface DevcleanConfig {
  /** Path the config was loaded from (whether or not it exists). */
  sourcePath: string;
  /** Adapter ids or absolute paths that should never be reported. */
  ignore: string[];
  /** User-defined caches that are not built into devclean. */
  extra: ExtraCache[];
  /** Non-fatal problems found while parsing. */
  warnings: string[];
}

export function configPath(env: Env): string {
  const override = env.vars.DEVCLEAN_CONFIG;
  if (override) return path.resolve(override);
  if (env.platform === "win32") return path.join(env.appData, "devclean", "config.json");
  if (env.platform === "darwin") {
    return path.join(env.home, "Library", "Application Support", "devclean", "config.json");
  }
  const xdg = env.vars.XDG_CONFIG_HOME || path.join(env.home, ".config");
  return path.join(xdg, "devclean", "config.json");
}

function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "custom";
}

function expandHome(value: string, env: Env): string {
  if (value === "~") return env.home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(env.home, value.slice(2));
  return value;
}

function isRisk(value: unknown): value is Risk {
  return value === "low" || value === "medium" || value === "high";
}

/**
 * Read the optional user config. A missing file is not an error; a malformed
 * one is reported through warnings and ignored rather than crashing a scan.
 */
export async function loadConfig(env: Env): Promise<DevcleanConfig> {
  const sourcePath = configPath(env);
  const config: DevcleanConfig = { sourcePath, ignore: [], extra: [], warnings: [] };

  let raw: string;
  try {
    raw = await fs.readFile(sourcePath, "utf8");
  } catch {
    return config;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    config.warnings.push("config is not valid JSON: " + (error instanceof Error ? error.message : String(error)));
    return config;
  }
  if (!parsed || typeof parsed !== "object") {
    config.warnings.push("config must be a JSON object");
    return config;
  }

  const record = parsed as Record<string, unknown>;

  if (Array.isArray(record.ignore)) {
    for (const entry of record.ignore) {
      if (typeof entry === "string" && entry.trim().length > 0) config.ignore.push(entry.trim());
      else config.warnings.push("ignore entries must be non-empty strings");
    }
  } else if (record.ignore !== undefined) {
    config.warnings.push("ignore must be an array of adapter ids or paths");
  }

  if (Array.isArray(record.extra)) {
    const used = new Set<string>();
    record.extra.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        config.warnings.push("extra[" + index + "] must be an object");
        return;
      }
      const item = entry as Record<string, unknown>;
      if (typeof item.name !== "string" || item.name.trim().length === 0) {
        config.warnings.push("extra[" + index + "] needs a name");
        return;
      }
      if (typeof item.path !== "string" || item.path.trim().length === 0) {
        config.warnings.push("extra[" + index + "] needs a path");
        return;
      }
      const base = typeof item.id === "string" && item.id.trim().length > 0 ? slug(item.id) : slug(item.name);
      let id = base;
      for (let n = 2; used.has(id); n += 1) id = base + "-" + n;
      used.add(id);
      config.extra.push({
        id,
        name: item.name.trim(),
        path: path.resolve(expandHome(item.path, env)),
        risk: isRisk(item.risk) ? item.risk : "medium",
        note:
          typeof item.note === "string" && item.note.trim().length > 0
            ? item.note.trim()
            : "Custom cache from your devclean config.",
      });
      if (item.risk !== undefined && !isRisk(item.risk)) {
        config.warnings.push('extra[' + index + '].risk must be "low", "medium" or "high"');
      }
    });
  } else if (record.extra !== undefined) {
    config.warnings.push("extra must be an array of { name, path, risk } objects");
  }

  return config;
}