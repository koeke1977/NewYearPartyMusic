param(
  [Parameter(Mandatory = $true)]
  [ValidateLength(32, 256)]
  [string]$BridgeToken
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $PSScriptRoot "server.mjs"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22+ is required. Install it before continuing."
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  throw "Claude Code CLI was not found. Install it and sign in with your Claude Pro account first."
}
if (-not (Test-Path $Server)) { throw "Bridge server not found: $Server" }

# Machine scope lets the scheduled task read the secret without embedding it in task arguments.
[Environment]::SetEnvironmentVariable("LOCAL_AI_BRIDGE_TOKEN", $BridgeToken, "Machine")
[Environment]::SetEnvironmentVariable("LOCAL_AI_PORT", "8787", "Machine")

$Node = (Get-Command node).Source
$Action = New-ScheduledTaskAction -Execute $Node -Argument ('"' + $Server + '"') -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName "PartyQueue Local AI Bridge" -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
Start-ScheduledTask -TaskName "PartyQueue Local AI Bridge"

Write-Host "PartyQueue Local AI Bridge installed and started."
Write-Host "Health check: http://127.0.0.1:8787/health"
Write-Host "The task starts again when this Windows account signs in."
Write-Warning "Keep the PC signed in during the party. The Cloudflare Tunnel service must also be installed separately."
