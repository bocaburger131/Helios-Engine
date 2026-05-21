# Run RuFlo doctor with Claude on PATH and API keys loaded.
# Usage: .\scripts\ruflo-doctor.ps1

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'load-ruflo-env.ps1')
npx ruflo doctor @args
