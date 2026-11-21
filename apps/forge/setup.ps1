# setup.ps1: the Windows bootstrap, for Windows PowerShell 5.1 and later, with no administrator rights. It makes sure Bun exists, offering
# Bun's official installer, then hands every argument to setup.ts, which does the setup steps the same way on every operating system.
# setup.sh is the macOS and Linux bootstrap.
#
# Usage: powershell -ExecutionPolicy Bypass -File setup.ps1 [--instruct-only]
#   --instruct-only  changes nothing: every offer declines and every write is reported as "would".
$ErrorActionPreference = 'Stop'

$instructOnly = $args -contains '--instruct-only'
$bunInstallFolder = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $env:USERPROFILE '.bun' }
$env:Path = (Join-Path $bunInstallFolder 'bin') + [IO.Path]::PathSeparator + $env:Path

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host '  bun not found'
  $answer = ''
  if (-not $instructOnly) {
    $answer = Read-Host '  Install Bun now via the official installer (irm bun.sh/install.ps1 | iex)? [y/N]'
  }
  if ($answer -ne 'y' -and $answer -ne 'Y') {
    Write-Host '  Bun is required. Install it from https://bun.sh and re-run setup.ps1'
    exit 1
  }
  Invoke-RestMethod 'https://bun.sh/install.ps1' | Invoke-Expression
  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host '  bun still not found after install: open a new terminal and re-run setup.ps1'
    exit 1
  }
}

# The tool's own bunfig and no .env, so a repository the user runs this from never loads its preload or variables into setup.
& bun --no-env-file "--config=$(Join-Path $PSScriptRoot 'bunfig.toml')" (Join-Path $PSScriptRoot 'setup.ts') @args
exit $LASTEXITCODE
