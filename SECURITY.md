# Security policy

devclean deletes files. A path bug is a data-loss bug, so security reports get priority.

## Reporting

Open a private security advisory on GitHub (Security -> Report a vulnerability), or email
the maintainer listed in `package.json`. Please do not open a public issue for anything
that could delete data outside a known cache.

You can expect an acknowledgement within 48 hours and a fix or mitigation within 7 days
for anything that can delete an unintended path.

## Supported versions

The latest minor release on npm receives fixes. There are no long-term branches.

## Threat model

What devclean defends against:

1. **Deleting outside a cache.** `src/clean.ts` only deletes paths that exactly match a
   configured adapter path or a known project artifact name inside a detected project.
   Unknown paths are refused even if a caller passes them.
2. **Symlink redirection.** `dirSize` and `findProjectArtifacts` skip symlinks entirely, so
   a crafted cache directory cannot make the scan walk into `~` or `/`.
3. **Silent scope creep.** High-risk adapters are opt-in (`--all`), and the report excludes
   them from the reclaimable total.
4. **Network exfiltration.** The CLI makes no network requests and collects no telemetry.
   The HTML report is a single file with inline CSS/JS, no external resources.

Out of scope: a user running `--all` against their own model weights, or a compromised
package manager that already writes wherever it wants.
