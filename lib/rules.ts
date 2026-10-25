/** 제보의 시간·거리·공개 좌표와 신고처 규칙. 서버와 테스트가 함께 사용합니다. */
export const labels: Record<string, string> = {
  PREPARING: "준비 중",
  USER_REPORTED: "신고 완료(사용자 확인)",
  INCOMPLETE: "신고 미완료",
};
/** 완료 상태를 보존하고 만료 경계(정확히 10분 포함)를 판정합니다. */
export function effectiveStatus(
  status: string,
  expiresAt: Date,
  now = new Date(),
) {
  return status === "USER_REPORTED"
    ? status
    : now >= expiresAt
      ? "INCOMPLETE"
      : "PREPARING";
}
/** 위경도 두 점 사이 지표 거리를 계산합니다.
 * @param a 첫 지점 위도(도).
 * @param b 첫 지점 경도(도).
 * @param c 두 번째 지점 위도(도).
 * @param d 두 번째 지점 경도(도).
 * @returns Haversine 공식으로 구한 거리(미터). 위치 입력 범위는 API에서 검사합니다.
 */
export function distance(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((c - a) * r) / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
/** 약 50m 격자 중심으로 좌표를 줄입니다. 익명화를 보장하지 않습니다. */
export function publicPoint(lat: number, lon: number) {
  const step = 50 / 111320;
  const x = 50 / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    latitude: Math.round(lat / step) * step,
    longitude: Math.round(lon / x) * x,
  };
}
/** 확인되지 않은 연락처를 생성하지 않고 시설별 연락 방법을 반환합니다. */
export function office(place: string) {
  return place === "학교"
    ? {
        name: "학교 관리자·행정실",
        url: "",
        help: "학교 공식 홈페이지에서 행정실 연락처를 확인하세요.",
      }
    : place === "사유시설"
      ? {
          name: "관리사무소·시설 운영자",
          url: "",
          help: "건물 안내판 또는 공식 홈페이지에서 연락처를 확인하세요.",
        }
      : {
          name: "안전신문고",
          url: "https://www.safetyreport.go.kr/",
          help: "정확한 담당 기관 확인이 필요할 수 있습니다.",
        };
}
