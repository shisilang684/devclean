# Changelog

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
