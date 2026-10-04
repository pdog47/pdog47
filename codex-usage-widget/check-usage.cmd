@echo off
rem Prints your current Codex usage once, so you can check the setup works.
cd /d "%~dp0"
node codex-usage-mcp.js --print
pause
