@echo off
rem Brenai: start Luma Ultra head tracking. Keep this window open while you play.
cd /d "%~dp0"
for /f "delims=" %%d in ('dir /s /b "%~dp0glasses.dll" 2^>nul') do (set "SDK=%%~dpd" & goto found)
echo Could not find glasses.dll under %~dp0. Put this file in C:\Viture next to the SDK folder.
pause
exit /b
:found
python viture-bridge.py --sdk "%SDK:~0,-1%" %*
pause
