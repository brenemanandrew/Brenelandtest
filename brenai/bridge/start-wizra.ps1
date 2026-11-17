# Starts Wizra's brain on this PC: loads MN-Violet-Lotus-12B in Bionic with a big context (shared with the Breneland
# townsfolk, so load it ONCE this way), starts Bionic's server on port 1234, then runs the bridge to brenai.fly.dev.
# Run in PowerShell from this folder:  powershell -ExecutionPolicy Bypass -File .\start-wizra.ps1
$lms = "$env:USERPROFILE\.lmstudio\bin\lms.exe"
$ctx = if ($env:WIZRA_CONTEXT) { $env:WIZRA_CONTEXT } else { 32768 }
& $lms unload --all
& $lms load mn-violet-lotus-12b --context-length $ctx --gpu max -y
& $lms server start --port 1234
if (-not $env:BRENAI_BRAIN_TOKEN) { Write-Host "Set BRENAI_BRAIN_TOKEN first: setx BRENAI_BRAIN_TOKEN `"<your secret>`" then open a new PowerShell."; exit 1 }
node "$PSScriptRoot\wizra-bridge.mjs"
