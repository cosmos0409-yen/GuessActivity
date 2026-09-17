# Deploy live-quiz from an ASCII-only temp folder.
# wrangler 4.131.1 on Node 24 (Windows) crashes with 0xC0000409 when the project path
# contains non-ASCII characters (e.g. C:\...\live-quiz). The wrangler binary itself may
# stay where it is; only the project folder (working directory) must be ASCII.
#
# Usage (in PowerShell, from the live-quiz folder):
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1           # deploy
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -DryRun   # bundle only, no upload
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $PSScriptRoot
$dst = Join-Path $env:TEMP 'live-quiz-deploy'
if ($dst -match '[^\x00-\x7F]') { throw "Temp path is not ASCII-only: $dst" }

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory $dst | Out-Null
foreach ($item in 'src', 'public', 'wrangler.jsonc', 'package.json') {
  Copy-Item (Join-Path $src $item) $dst -Recurse
}

$wrangler = Join-Path $src 'node_modules\wrangler\bin\wrangler.js'
Push-Location $dst
try {
  if ($DryRun) {
    node $wrangler deploy --dry-run --outdir (Join-Path $dst 'out')
  } else {
    node $wrangler deploy
  }
  if ($LASTEXITCODE -ne 0) { throw "wrangler exited with code $LASTEXITCODE" }
} finally {
  Pop-Location
}
