@echo off
rem Starts the phone page for your Codex usage. Open the address it prints on your phone
rem (with Tailscale on). Keep this window open, or run install-phone-startup.cmd once instead.
cd /d "%~dp0"
node codex-usage-web.js
pause
