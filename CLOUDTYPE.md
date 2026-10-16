# 하진그룹 Cloudtype 단독 운영

이 버전은 Supabase를 사용하지 않습니다. A/S/문서 데이터와 사진을 Cloudtype 서버의 DATA_DIR에 저장합니다.

## Cloudtype 설정
- GitHub 저장소: hajin-integrated-system / main
- Dockerfile 배포
- 공개 포트: 3000/http
- 환경변수: ADMIN_ID, ADMIN_PASSWORD, DATA_DIR=/data
- 영구 디스크: 10GB 이상 권장, 마운트 경로 `/data`

중요: 영구 디스크 없이 DATA_DIR을 컨테이너 내부로 두면 재배포/재시작 때 데이터가 사라질 수 있습니다.

## 데이터 위치
- 업무 데이터: /data/hajin-data.json
- 사진: /data/uploads/<A/S번호>/...

## 배포 전 테스트
npm ci
npm run build
npm start

## 홈페이지 · AS 통합 로그인

- `/` → `/office/`: 회사 홈페이지
- `/office/#overview`: 직원 로그인 후 통합 관리 화면
- `/as`: 기존 AS 앱. 미인증 요청은 `/office/#as` 로그인 화면으로 이동
- 홈페이지 로그인은 기존 `/api/login`과 HttpOnly 세션 쿠키를 사용합니다. 비밀번호나 로그인 토큰을 localStorage 또는 URL에 저장하지 않습니다.
- 유효한 서버 세션은 AS에 그대로 전달되며 재로그인을 요구하지 않습니다. 로그아웃, 쿠키 만료(12시간), 서버 재시작 시 재로그인이 필요합니다. 현재 세션은 기존과 같이 서버 메모리에 저장됩니다.
- 기존 ADMIN_ID / ADMIN_PASSWORD / DATA_DIR 설정과 `/data` 영구 디스크를 유지한 채 재배포하세요. 기존 JSON과 업로드 파일을 초기화하거나 이동하지 않습니다.
- 홈페이지의 예산·프로젝트 데이터는 여전히 브라우저의 예시/로컬 데이터입니다. AS의 실제 서버 데이터와 자동 합산하지 않습니다.
- GitHub Pages는 공개 회사 소개 페이지로 유지할 수 있지만 직원 로그인/업무 화면은 이 Cloudtype 서버의 `/office/`에서 사용해야 같은 세션을 공유합니다.
