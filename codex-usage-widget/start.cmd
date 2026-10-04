@echo off
rem Starts the Codex usage server for StarNet at http://127.0.0.1:8765/mcp
rem Keep this window open while you use StarNet (or run install-startup.cmd once instead).
cd /d "%~dp0"
node codex-usage-mcp.js --http 8765
pause
