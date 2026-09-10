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
