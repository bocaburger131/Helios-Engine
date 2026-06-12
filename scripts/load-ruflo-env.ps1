# Load RuFlo / Gemini env vars from bank-statement-analyzer-api\.env
# Usage: . .\scripts\load-ruflo-env.ps1
# Use dot-source so variables apply to your current PowerShell session.

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repoRoot 'bank-statement-analyzer-api\.env'
if (-not (Test-Path $envFile)) {
  Write-Error "Missing .env file: $envFile"
}

$keys = @('GOOGLE_API_KEY', 'GEMINI_API_KEY')
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([^#][^=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim().Trim('"').Trim("'")
    if ($name -in $keys) {
      Set-Item -Path "env:$name" -Value $value
    }
  }
}

$binPath = Join-Path $env:USERPROFILE '.local\bin'

# Refresh PATH from registry (fixes Cursor terminals opened before User PATH was updated)
$merged = [System.Collections.Generic.List[string]]::new()
foreach ($level in @('Machine', 'User')) {
  $segment = [Environment]::GetEnvironmentVariable('Path', $level)
  if ($segment) {
    foreach ($part in ($segment -split ';')) {
      if ($part) { $merged.Add($part.TrimEnd('\')) }
    }
  }
}
if ((Test-Path $binPath) -and ($merged -notcontains $binPath)) {
  $merged.Insert(0, $binPath)
}
$env:PATH = ($merged | Select-Object -Unique) -join ';'

foreach ($k in $keys) {
  if (Get-Item "env:$k" -ErrorAction SilentlyContinue) {
    Write-Host "$k : set"
  } else {
    Write-Warning "$k : missing in $envFile"
  }
}
