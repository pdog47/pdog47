@echo off
rem Makes the Codex usage server start hidden every time you log in to Windows,
rem and starts it now. To undo, delete "codex-usage-mcp.vbs" from the Startup folder
rem (press Win+R, type shell:startup, press Enter).
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\codex-usage-mcp.vbs"
set "SCRIPT=%~dp0codex-usage-mcp.js"
> "%VBS%" echo CreateObject("WScript.Shell").Run "node ""%SCRIPT%"" --http 8765", 0, False
wscript "%VBS%"
echo Installed. The server now starts hidden at login and is running now.
echo StarNet connector URL: http://127.0.0.1:8765/mcp
pause
