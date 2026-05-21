# Debug diagnostics for Claude PATH + RuFlo doctor (session e9c255)
# Usage: .\scripts\diagnose-ruflo-env.ps1

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
$logPath = Join-Path $repoRoot 'debug-e9c255.log'
$binPath = Join-Path $env:USERPROFILE '.local\bin'
$claudeExe = Join-Path $binPath 'claude.exe'

function Write-DebugLog {
  param([string]$hypothesisId, [string]$message, [hashtable]$data)
  $entry = @{
    sessionId = 'e9c255'
    hypothesisId = $hypothesisId
    location = 'diagnose-ruflo-env.ps1'
    message = $message
    data = $data
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    runId = 'pre-fix'
  } | ConvertTo-Json -Compress
  Add-Content -Path $logPath -Value $entry -Encoding utf8
}

# H5: binary exists on disk
Write-DebugLog -hypothesisId 'H5' -message 'claude binary on disk' -data @{
  claudeExeExists = (Test-Path $claudeExe)
  claudeExe = $claudeExe
}

# H1/H2: User vs session PATH
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
Write-DebugLog -hypothesisId 'H1' -message 'PATH registry vs session' -data @{
  userPathHasLocalBin = ($userPath -like "*\.local\bin*")
  machinePathHasLocalBin = ($machinePath -like "*\.local\bin*")
  sessionPathHasLocalBin = ($env:PATH -like "*\.local\bin*")
  pathEntryCount = ($env:PATH -split ';').Count
}

# H3: npx subshell behavior (simulate cmd lookup)
$cmdLookup = & cmd /c "where claude 2>nul" 2>$null
Write-DebugLog -hypothesisId 'H3' -message 'cmd where claude' -data @{
  cmdFindsClaude = [bool]$cmdLookup
  cmdOutput = if ($cmdLookup) { $cmdLookup.ToString() } else { 'not found' }
}

# H4: PowerShell Get-Command before/after PATH fix
$beforeCmd = Get-Command claude -ErrorAction SilentlyContinue
Write-DebugLog -hypothesisId 'H4' -message 'powershell claude before PATH prepend' -data @{
  found = [bool]$beforeCmd
  source = if ($beforeCmd) { $beforeCmd.Source } else { $null }
}

if ((Test-Path $binPath) -and ($env:PATH -notlike "*$binPath*")) {
  $env:PATH = "$binPath;$env:PATH"
}

$afterCmd = Get-Command claude -ErrorAction SilentlyContinue
Write-DebugLog -hypothesisId 'H4' -message 'powershell claude after PATH prepend' -data @{
  found = [bool]$afterCmd
  source = if ($afterCmd) { $afterCmd.Source } else { $null }
}

# RuFlo doctor Claude check (capture exit text only, no secrets)
$doctorOut = & npx --yes ruflo doctor 2>&1 | Out-String
$claudeLine = ($doctorOut -split "`n" | Where-Object { $_ -match 'Claude Code CLI' }) -join '; '
Write-DebugLog -hypothesisId 'H4' -message 'ruflo doctor claude line' -data @{
  claudeDoctorLine = $claudeLine.Trim()
  doctorShowsNotInstalled = ($claudeLine -match 'Not installed')
}

Write-Host "Diagnostics written to $logPath"
Write-Host "Claude on disk: $(Test-Path $claudeExe)"
Write-Host "User PATH has .local\bin: $($userPath -like '*\.local\bin*')"
Write-Host "Session PATH has .local\bin: $($env:PATH -like '*\.local\bin*')"
Write-Host "Get-Command claude: $(if ($afterCmd) { $afterCmd.Source } else { 'missing' })"
Write-Host $claudeLine
