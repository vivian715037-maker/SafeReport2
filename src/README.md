# 소스 폴더 안내

- `app/page.tsx` → `components/SimpleApp.tsx`가 간편 4단계 작성·내 기록·전국 지도·상세·안내 화면을 엽니다. 기존 `components/Fixit.tsx`는 사용자 요청에 따라 삭제하지 않고 보존했습니다. 상세 링크 `/?report=ID`는 계속 지원합니다.
- `app/layout.tsx`는 한국어 문서와 메타데이터, `app/globals.css`는 기존 공통 스타일, `app/simple.css`는 큰 글자·버튼의 간편 화면 스타일을 연결합니다.
- `components/Map.tsx`는 브라우저에서만 Leaflet을 불러와 클릭·드래그·공개 핀 그룹을 처리합니다. 입력 좌표는 상위 화면에 전달하고 저장은 API에 맡깁니다.
- `components/RiskAssessment.tsx`는 제보별 AI 위험도·근거·시각과 본인 전용 재분석 동의를 표시합니다. `Map.tsx`는 위험 지도 모드에서 최고 개별 위험도에 따라 그룹 색상을 표시하며 화면 폭 변경 시 범위를 다시 맞춥니다.
- `app/api/[...segments]/route.ts`는 `/api/reports` 아래 API 요청을 나눠 처리합니다. 업로드·편집·AI·공개·상태·삭제 순서별 분기가 있습니다.
- `lib/server.ts`는 Prisma 연결, 브라우저 소유권, 입력 검증, 공개 응답 필터, AI 요청을 담당하는 **서버 전용** 모듈입니다. 클라이언트 컴포넌트에서 가져오지 않습니다.
- `lib/rules.ts`는 시각에 따른 상태, 거리, 공개 좌표, 규칙 기반 신고처를 계산하며 화면·서버·테스트에서 함께 사용합니다.
- `lib/similarity.ts`는 150m 후보 정렬·문구 유사도·판정 집계, `lib/similar-server.ts`는 공개 사진 제한·AI 후보별 비교·5분 결과 캐시를 담당합니다.
- `lib/risk.ts`는 위험도 스키마·프롬프트·색상·입력 변경에 따른 무효화와 그룹 대표 위험도 규칙을 공유합니다.
- `components/LocationSearch.tsx` → `app/api/locations/route.ts` → `lib/geocoding.ts`로 명시적 장소 검색을 수행합니다. 현재 위험 지도는 전국 공개 제보를 표시하며 지역 선택을 요구하지 않습니다. `lib/location.ts`의 경계 검사 도구는 기존 파일 보존을 위해 남겨 두었습니다.
- `components/WelcomeIllustration.tsx`는 직접 그린 거리·위치 핀의 장식용 SVG입니다. 실제 신고나 AI 결과가 아니며 홈에서만 표시합니다. 입력 단계에는 장식을 추가하지 않습니다.
- `data/regions.json`은 이전 지역 선택용 공식 코드·명칭 스냅샷이며 현재 전국 지도에서는 사용하지 않습니다. 출처·기준일은 `data/README.md`에 있습니다.
- `lib/report-assistance.ts`는 세 번째 화면의 관찰 분석(`inspect`)과 네 번째 화면의 AI 제목·신고문 생성(`draft`)을 분리합니다.

사용자 입력부터 결과까지의 설명은 상위 `개발설명서.md`에서 실제 함수와 연결해 설명합니다. 작은 하위 폴더는 이 문서에서 함께 설명합니다.
