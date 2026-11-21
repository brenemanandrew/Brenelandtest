# One time, on the PC that runs the models. Installs the Brenebase agent and worker into %USERPROFILE%\Brenebase and
# starts the agent at every login, hidden. Per user, no admin rights needed.
#   irm https://brenebase.fly.dev/pc/install-agent.ps1 | iex
# Remove: Unregister-ScheduledTask -TaskName "Brenebase agent" -Confirm:$false; Remove-Item -Recurse "$env:USERPROFILE\Brenebase"
$base = "https://brenebase.fly.dev"
$dir = "$env:USERPROFILE\Brenebase"
foreach ($d in $dir, "$dir\worker", "$dir\pc") { New-Item -ItemType Directory -Force $d | Out-Null }
foreach ($f in 'pc/brenebase-agent.mjs', 'worker/hub-worker.mjs', 'worker/blender_ops.py', 'parts.mjs') { Invoke-WebRequest "$base/pc-files/$f" -OutFile (Join-Path $dir ($f -replace '/', '\')) }
Set-Content -Path "$dir\package.json" -Value '{ "name": "brenebase-pc", "private": true, "type": "module" }' -Encoding ascii

# the PC key: typed here, never sent anywhere but Brenebase
if (-not [Environment]::GetEnvironmentVariable('HUB_WORKER_TOKEN', 'User')) {
  $k = Read-Host "PC key (the same value as the HUB_WORKER_TOKEN secret on Brenebase)"
  [Environment]::SetEnvironmentVariable('HUB_WORKER_TOKEN', $k, 'User')
}
[Environment]::SetEnvironmentVariable('HUB_URL', $base, 'User')

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if (-not $node) { Write-Host "Node.js not found. Install it: winget install -e --id OpenJS.NodeJS.LTS, then run this again."; exit 1 }

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\pc\brenebase-agent.mjs`"" -WorkingDirectory "$dir\pc"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
Register-ScheduledTask -TaskName "Brenebase agent" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "Brenebase agent"
Write-Host "Brenebase agent installed and started. It starts again at every login."

$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) { Write-Host "Tailscale name of this PC: $((& tailscale status --json | ConvertFrom-Json).Self.DNSName)  (put the first part in Brenebase's PC_TAILNET_HOST)" }
else { Write-Host "Tailscale is not installed. The agent still works by polling Brenebase. For the direct path: winget install -e --id Tailscale.Tailscale" }
Write-Host "Remote start only works while this PC is awake. To stop it sleeping on mains power: powercfg /change standby-timeout-ac 0"
