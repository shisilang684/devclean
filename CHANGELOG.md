# Changelog

## 0.5.1

- Published on npm as `devclean-cache` (the bare name `devclean` is refused as too similar to the
  existing `dev-clean` package). The installed binary is still `devclean`.
- Documentation updated for the npm install path: `npm i -g devclean-cache`, `npx devclean-cache`.

## 0.5.0

- Config file for ignores and custom caches: `devclean config` shows it, `DEVCLEAN_CONFIG`
  overrides the location. Custom entries are validated and default to medium risk.

## 0.4.0

- Seven new cache adapters: NuGet, conda, sbt/Ivy, Deno, Cypress, Electron, Composer (22 total).
- Tests now verify every adapter exposes absolute paths and that only the local model
  runtimes are classified high risk.

## 0.3.0

- `devclean clean -i` interactive picker: select what to delete with space/a/n/arrows.
- Non-TTY runs never skip the confirmation prompt.

## 0.2.0

- `devclean report` writes a self-contained HTML report with a treemap of every cache.

## 0.1.0

- First release: scan 15 cache families, clean low/medium risk caches, find project
  artifacts (`node_modules`, `.venv`, `target`).