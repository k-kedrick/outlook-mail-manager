@echo off
REM Renew all Outlook refresh tokens. Point Windows Task Scheduler at this file.
cd /d "%~dp0.."
call npx tsx scripts/keep-alive.ts >> "%~dp0keep-alive.log" 2>&1
