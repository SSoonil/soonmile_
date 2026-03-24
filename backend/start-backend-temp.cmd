@echo off
cd /d C:\Users\Administrator\Desktop\codex\soonmile\backend
set OPENAI_API_KEY=dummy-local-key
set SPRING_AI_MODEL_CHAT=none
mvn spring-boot:run > backend-server.out.log 2> backend-server.err.log
