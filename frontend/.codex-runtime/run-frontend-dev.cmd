@echo off
cd /d C:\Users\Administrator\Desktop\codex\soonmile\frontend
npm.cmd run dev -- --host 0.0.0.0 --port 5173 1>.codex-runtime\frontend-dev.out.log 2>.codex-runtime\frontend-dev.err.log
