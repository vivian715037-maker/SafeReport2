# SafeReport2 — 현재 운영 사이트 소스

배포 사이트: https://safereport2-private.edupro25909.chatgpt.site/

이 브랜치(`deployed-site`)는 운영 사이트 버전 4의 소스 커밋 `34a9ba0833e9de3194b8e502c8eb65e8fbb0635e`에서 가져온 코드입니다. 기존 `main`의 로컬 MVP 소스를 덮어쓰지 않습니다. 앱 코드는 배포 커밋 그대로이며 GitHub 공유를 위한 설명서·줄바꿈·제외 설정과 키 없는 예시 파일만 보완했습니다.

## 핵심 기능

사진 → 위치 확인 → 동의 후 AI 신고문 작성·앱 내부 유사 제보 → 공식 신고처 안내·제목/내용 복사. `신고 기록`에서 전국 사용자 제보 기록과 AI 추정 위험도를 확인합니다.

공식 기관에 자동 접수하지 않습니다. 사용자가 공식 사이트에서 직접 제출하며 완료 상태도 사용자 확인에 따른 기록입니다. 중복 비교는 앱 내부 공개 제보만 대상으로 하고 AI 위험도는 추정입니다.

## 기술과 데이터

- 화면: React/TypeScript, Next.js 호환 Vinext.
- 서버: Cloudflare Workers, D1 DB, R2 사진.
- AI: 서버의 OpenRouter를 통해 Gemini 호출.
- 지도/검색: Leaflet, OpenStreetMap, Nominatim.
- 실제 DB·업로드 사진·브라우저 쿠키·API 키·빌드 결과는 저장소에 포함하지 않습니다. 공개 JSON은 신고처·지역·경계 기준 데이터입니다.

## Windows 로컬 실행

Node.js 22.13 이상과 npm, 인터넷 연결이 필요합니다. PowerShell에서:

```powershell
git clone --branch deployed-site https://github.com/vivian715037-maker/SafeReport2.git
cd SafeReport2
npm.cmd ci
npm.cmd run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_blushing_moira_mactaggert.sql
npm.cmd start -- --port 8787
```

브라우저에서 http://127.0.0.1:8787 을 엽니다. 종료는 Ctrl+C입니다. 다른 프로그램이 포트를 사용하면 비어 있는 포트로 변경합니다. 이 명령은 로컬 D1/R2를 사용하며 운영 데이터에 연결하거나 사이트를 재배포하지 않습니다.

AI를 사용할 때는 빌드 후 `.dev.vars.example`을 `dist/server/.dev.vars`로 복사하고 본인 `OPENROUTER_API_KEY`를 입력한 뒤 서버를 실행합니다. 실제 키 파일은 제외 설정으로 보호됩니다. 키가 없을 때도 사진·위치·직접 작성 기능을 확인할 수 있지만 AI 작성·비교는 사용할 수 없습니다. 지도·검색은 외부 네트워크에 의존합니다.

Linux에서는 `npm.cmd` 대신 `npm`을 사용합니다. 이번 업로드 검증 환경은 Windows이며 Linux 실행은 별도로 확인해야 합니다.

## 폴더와 검증

전체 구조·실제 처리 흐름·발표 설명은 [개발설명서.md](./개발설명서.md), 배포 원본의 과거 기록은 [DEPLOYMENT-HISTORY.md](./DEPLOYMENT-HISTORY.md), 데이터 목록 설명은 [data/README.md](./data/README.md)를 확인하세요. 과거 기록의 접근 권한과 검사 수치는 당시 기록이며 현재 설정·AI 정확도와 구분합니다.

타입 검사: `node node_modules/typescript/bin/tsc --noEmit`

로컬 API 확인: `/`의 HTTP 200과 `/api/reports/map`의 JSON 응답, 네 단계 화면의 정상 표시를 확인합니다. 실제 AI는 별도 키·호출 비용이 필요합니다.

`.openai/hosting.json`에는 원본 사이트 ID와 D1/R2 바인딩 이름만 있으며 키는 없습니다. 다른 계정에서 새로 배포하려면 본인 프로젝트·저장소 연결을 설정해야 합니다. GitHub 업로드만으로 운영 사이트가 갱신되지는 않습니다.

## 알려진 의존성 검사 결과

현재 배포 의존성에서 취약점 5건(critical 1건 포함)이 보고되었습니다. 상세 결과와 확인 범위는 [SECURITY-NOTES.md](./SECURITY-NOTES.md)를 확인하세요. 이번 소스 공유에서 자동 수정하거나 운영 사이트를 재배포하지 않았습니다.

