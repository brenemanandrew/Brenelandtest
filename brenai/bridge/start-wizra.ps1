# Starts Wizra's brain on this PC: loads MN-Violet-Lotus-12B in Bionic with a big context (shared with the Breneland
# townsfolk, so load it ONCE this way), starts Bionic's server on port 1234, then runs the bridge to brenai.fly.dev.
# Run in PowerShell from this folder:  powershell -ExecutionPolicy Bypass -File .\start-wizra.ps1
$lms = "$env:USERPROFILE\.lmstudio\bin\lms.exe"
$ctx = if ($env:WIZRA_CONTEXT) { $env:WIZRA_CONTEXT } else { 32768 }
& $lms unload --all
& $lms load mn-violet-lotus-12b --context-length $ctx --gpu max -y
& $lms server start --port 1234
# the secret and Node, even in a window opened before they were set up
if (-not $env:BRENAI_BRAIN_TOKEN) { $env:BRENAI_BRAIN_TOKEN = [Environment]::GetEnvironmentVariable('BRENAI_BRAIN_TOKEN','User') }
if (-not $env:BRENAI_BRAIN_TOKEN) { Write-Host "Set BRENAI_BRAIN_TOKEN first: setx BRENAI_BRAIN_TOKEN `"<your secret>`" then open a new PowerShell."; exit 1 }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1 }
if (-not $node) { $node = (Get-Process node -ErrorAction SilentlyContinue | Select-Object -First 1).Path }
if (-not $node) { Write-Host "Node.js not found. Install it: winget install -e --id OpenJS.NodeJS.LTS"; exit 1 }
# her voice (Kokoro): installed once, next to the bridge
if (-not (Test-Path "$PSScriptRoot\node_modules\kokoro-js")) {
  $npm = Join-Path (Split-Path $node) "npm.cmd"
  if (Test-Path $npm) { Write-Host "Installing her voice (one time, a minute or two)..."; Push-Location $PSScriptRoot; & $npm install kokoro-js --no-fund --no-audit --loglevel=error; Pop-Location }
  else { Write-Host "npm not found next to Node; she will use the device voice instead." }
}
& $node "$PSScriptRoot\wizra-bridge.mjs"
