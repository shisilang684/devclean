# Publish devclean to GitHub and npm.
# Prereq: GitHub CLI authenticated (gh auth login) and npm logged in (npm login).
# Usage: pwsh -File scripts/publish.ps1 [-NpmPublish]

param(
  [string]$RepoOwner = "shisilang684",
  [string]$RepoName = "devclean",
  [switch]$NpmPublish
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Require($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Error "'$cmd' not found. $hint"
  }
}

Require "gh" "Install it: winget install --id GitHub.cli -e  then run: gh auth login"
Require "git" "Install Git for Windows."
Require "npm" "Install Node.js 18+."

gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "Not logged in to GitHub. Run: gh auth login" }

if (-not (Test-Path "node_modules")) { npm install }
npm run build
npm test
if ($LASTEXITCODE -ne 0) { Write-Error "Tests failed; refusing to publish." }

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m "chore: prepare release" }

$existing = git remote get-url origin 2>$null
if (-not $existing) {
  gh repo create "$RepoOwner/$RepoName" --public --description "Find and reclaim the gigabytes your dev tools are hoarding - npm, pip, cargo, Gradle, Playwright, Hugging Face, Ollama and more." --source . --remote origin --push
} else {
  git push -u origin main
}

# Topics drive GitHub search traffic.
$topics = @("cli","disk-space","cleanup","cache","nodejs","developer-tools","windows","macos","linux","llm","huggingface","ollama","storage")
foreach ($t in $topics) {
  gh api -X PUT "repos/$RepoOwner/$RepoName/topics" -f "names[]=$t" *> $null
}

Write-Host ""
Write-Host "Repo: https://github.com/$RepoOwner/$RepoName"

if ($NpmPublish) {
  npm publish --access public
  Write-Host "Published to npm: https://www.npmjs.com/package/$RepoName"
} else {
  Write-Host "Next: npm login && npm publish --access public"
}
