@echo off
rem Makes the phone page start hidden every time you log in to Windows, and starts it now.
rem To undo, delete "codex-usage-web.vbs" from the Startup folder
rem (press Win+R, type shell:startup, press Enter).
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\codex-usage-web.vbs"
set "SCRIPT=%~dp0codex-usage-web.js"
> "%VBS%" echo CreateObject("WScript.Shell").Run "node ""%SCRIPT%""", 0, False
wscript "%VBS%"
echo Installed. The phone page now starts hidden at login and is running now.
echo On your phone, open:  http://YOUR-PC-TAILSCALE-IP:8766
echo (Find the IP in the Tailscale app, or run:  tailscale ip -4)
pause
