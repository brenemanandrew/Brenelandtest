# One time, on the PC that runs Wizra's brain: makes the "Start her brain" button on the Brenai login screen work.
# It teaches Windows a link type, brenai-brain://, that opens a PowerShell window running start-wizra.ps1 from your Brenai
# folder. Nothing from the link itself is passed to the command, so a web page can only ever start this one script.
# It also fetches the current bridge files. Per user, no admin rights needed. To remove it again:
#   Remove-Item -Recurse HKCU:\Software\Classes\brenai-brain
$dir = "$env:USERPROFILE\Brenai"
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($f in 'wizra-bridge.mjs', 'start-wizra.ps1') { Invoke-WebRequest "https://brenai.fly.dev/bridge/$f" -OutFile (Join-Path $dir $f) }
$key = 'HKCU:\Software\Classes\brenai-brain'
New-Item -Force $key | Out-Null
Set-ItemProperty $key '(default)' 'URL:Brenai brain'
Set-ItemProperty $key 'URL Protocol' ''
New-Item -Force "$key\shell\open\command" | Out-Null
Set-ItemProperty "$key\shell\open\command" '(default)' "powershell.exe -NoExit -ExecutionPolicy Bypass -File `"$dir\start-wizra.ps1`""
Write-Host "Done. The 'Start her brain' button on brenai.fly.dev now works on this PC."
if (-not [Environment]::GetEnvironmentVariable('BRENAI_BRAIN_TOKEN', 'User')) { Write-Host "Note: BRENAI_BRAIN_TOKEN is not set on this PC yet (see the bridge README)." }
