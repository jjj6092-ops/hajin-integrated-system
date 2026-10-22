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
- `/as`: 기존 AS 앱. 미인증 요청은 `/office/#overview` 로그인 화면으로 이동
- 홈페이지 로그인은 기존 `/api/login`과 HttpOnly 세션 쿠키를 사용합니다. 비밀번호나 로그인 토큰을 localStorage 또는 URL에 저장하지 않습니다.
- 유효한 서버 세션은 AS에 그대로 전달되며 재로그인을 요구하지 않습니다. 로그아웃, 쿠키 만료(12시간), 서버 재시작 시 재로그인이 필요합니다. 현재 세션은 기존과 같이 서버 메모리에 저장됩니다.
- 기존 ADMIN_ID / ADMIN_PASSWORD / DATA_DIR 설정과 `/data` 영구 디스크를 유지한 채 재배포하세요. 기존 JSON과 업로드 파일을 초기화하거나 이동하지 않습니다.
- 홈페이지의 예산·프로젝트 데이터는 여전히 브라우저의 예시/로컬 데이터입니다. AS의 실제 서버 데이터와 자동 합산하지 않습니다.
- GitHub Pages는 공개 회사 소개 페이지로 유지할 수 있지만 직원 로그인/업무 화면은 이 Cloudtype 서버의 `/office/`에서 사용해야 같은 세션을 공유합니다.

로그인 성공 직후에는 진입 경로와 관계없이 종합 대시보드(`#overview`)를 먼저 표시합니다. AS는 로그인 후 메뉴에서 선택합니다.

## 배포 진단

`/api/version`이 `hajin-office-home-v3`를 반환하면 홈페이지·AS 경로 분리 버전입니다. 기본 앱 경로 `/`는 회사 홈페이지이며 `/as`에서만 AS 화면을 제공합니다.

GitHub Actions는 공개 저장소를 HTTPS로 가져오므로 별도 GHP_TOKEN/배포 키 등록 단계를 사용하지 않습니다. 저장소 Actions secret `CLOUDTYPE_TOKEN`은 필요합니다. 배포는 선택한 커밋 SHA로 고정됩니다. GitHub Actions 성공과 Cloudtype 빌드·서비스 정상 응답은 별도로 확인해야 합니다.

## 이카운트 ERP 재고 조회

통합 오피스의 `재고 관리` 메뉴에서 기준일·창고코드·품목코드로 조회하고 CSV로 내보낼 수 있습니다. API는 읽기 전용이며 입출고나 AS 부품 차감은 수행하지 않습니다. 현재 연동에서는 각 필터에 코드 1개 또는 공란(전체)만 받습니다. 여러 코드의 결합 형식은 추가 명세 확인 후 지원합니다.

기존 서비스의 환경변수에 다음을 추가하고 재배포합니다. 기존 ADMIN_ID/ADMIN_PASSWORD/DATA_DIR와 디스크 설정은 그대로 유지하세요.

| 이름 | 설정 |
| --- | --- |
| ECOUNT_COM_CODE | 이카운트 회사코드 |
| ECOUNT_USER_ID | API 인증키를 발급한 이카운트 사용자 ID |
| ECOUNT_API_CERT_KEY | 해당 환경의 API 인증키. 서버 비밀값으로만 저장 |
| ECOUNT_MODE | `test`(기본) 또는 `production` |

처음에는 테스트 인증키와 `test`를 사용하세요. 운영 전환 시에는 운영용 인증키와 `production`을 함께 설정합니다. 키·세션 ID를 채팅, GitHub 소스, 홈페이지 입력칸에 넣지 않습니다. 설정 확인 API는 환경변수의 이름과 설정 여부만 반환합니다.

이카운트 `API인증키발급 → IP등록`에 현재 Cloudtype 서비스의 아웃바운드 IP를 등록해야 합니다. 현재 서비스 설정에 표시되는 모든 IP를 기준으로 등록하고, 서비스 주소의 DNS IP로 대체하지 않습니다.

서버는 `sboapi.ecount.com`(테스트) 또는 `oapi.ecount.com`(운영)에서 Zone을 받은 뒤 `sboapi{ZONE}.ecount.com` 또는 `oapi{ZONE}.ecount.com`의 로그인·재고 API를 호출합니다. 네트워크 제한이 있다면 해당 호스트들을 허용해야 합니다. TLS 검증은 유지됩니다.

동일 조회는 60초간 캐시하고, 동시 동일 요청은 하나로 합치며 서로 다른 조회는 5초 간격을 적용합니다. 계정의 실제 시간당·일일 한도는 이카운트의 정책을 따릅니다. 세션은 서버 메모리에서 재사용하며 인증 오류 시 재시도를 사용자가 명시적으로 수행합니다. 재고 응답 오류를 임의의 0 수량으로 표시하지 않습니다.

검증: `node --test tests/ecount.test.mjs tests/office-session.test.mjs`는 가짜 ERP 응답으로 인증·조회·캐시·오류·접근 제어를 검증합니다. 실제 ERP 호출 검증은 환경변수, 허용 IP 설정 후 별도로 해야 합니다. 조회 수량은 기준일별 결과이며 실시간 자동 동기화가 아닙니다.
