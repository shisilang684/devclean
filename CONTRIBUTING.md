# Contributing

Thanks for helping. The most useful contribution is a **cache I missed** - devclean is
only as good as its adapter list.

## Setup

```bash
git clone https://github.com/shisilang684/devclean
cd devclean
npm install
npm run build
npm test
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1` (execution policy).

## Adding a cache adapter

Adapters live in `src/adapters.ts`. Each one is a small object: where the cache lives on
each OS, how risky it is to delete, and a note explaining what it is.

```ts
{
  id: "deno",
  name: "Deno cache",
  risk: "low",
  note: "Re-downloaded on next run",
  paths: (env) => [
    join(env.home, ".cache", "deno"),                 // macOS + Linux
    join(env.localAppData ?? "", "deno", "Cache"),    // Windows
  ],
}
```

Rules that keep this tool safe:

1. **Only point at a known cache directory**, never at a parent that contains user files.
   `src/clean.ts` refuses paths that do not match a known adapter, so a wrong path is a bug.
2. **Pick the risk honestly.**
   - `low` - pure download cache, rebuilt automatically (npm, pip, Cargo)
   - `medium` - expensive to rebuild or may be offline-only (Maven, Hugging Face)
   - `high` - user data beyond a cache, e.g. local model weights (Ollama, LM Studio)
3. **Verify the path on a real machine** before opening the PR, and paste the output of
   `devclean scan --only <id>` in the description.
4. Add an entry to the table in `README.md` and a line to the adapter test in
   `test/scan.test.mjs`.

## Tests

```bash
npm test          # unit tests, no network
npm run build     # typecheck + emit dist/
```

Please keep the suite green and add a test when you change selection or deletion logic.

## Safety and scope

devclean never deletes anything outside the paths its adapters report, never touches
`node_modules` unless you run `projects`, and always prints the plan before deleting.
PRs that broaden deletion scope without a clear safety argument will be declined.

## Commit messages

`type: short summary` - `feat`, `fix`, `docs`, `test`, `chore`. One logical change per PR.
