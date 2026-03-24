# Soonmile Fullstack Starter

`React (Vite)` 프론트엔드와 `Spring Boot (Java 21)` 백엔드 기본 구성이 완료된 프로젝트입니다.

## 폴더 구조

```text
soonmile/
  frontend/   # React + Vite
  backend/    # Spring Boot (Java 21)
```

## 실행 전 요구사항

1. Node.js 18+ (권장: 20+)
2. JDK 21
3. Maven 3.9+

## 프론트 실행

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

기본 주소: `http://localhost:5173`

## 백엔드 실행

```powershell
cd backend
mvn spring-boot:run
```

기본 주소: `http://localhost:8080`

헬스 체크: `http://localhost:8080/api/health`

## 연결 포인트

- 프론트는 `VITE_API_BASE_URL`(기본값: `http://localhost:8080`)로 API 호출
- Vite 프록시(`/api -> 8080`) 설정 포함
- Spring CORS는 `http://localhost:5173` 허용

## One-Command Dev Stack

```powershell
powershell -ExecutionPolicy Bypass -File .\run-dev.ps1
```

or

```cmd
run-dev.cmd
```

This script does the following in one foreground process:
- Ensures Docker daemon is reachable
- Starts (or reuses) `soonmile-postgres` on `localhost:5432`
- Starts frontend (`5173`) and backend (`8080`) if they are not already running
- Keeps running and stops only the processes it started when you press `Ctrl+C`

Optional:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-dev.ps1 -StopPostgresOnExit
```
