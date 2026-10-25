/** 중복 제보 후보 선정·판정 규칙. 위치만으로 같은 사고를 확정하지 않고 자료와 판정 근거를 구분합니다. */
import { distance } from "./rules";
export const SIMILAR_RADIUS_METERS = 150;
export const SIMILAR_MAX_CANDIDATES = 8;
export type Comparable = {
  id: string;
  title: string;
  description: string;
  riskType: string;
  latitude: number | null;
  longitude: number | null;
};
export type Verdict = "SAME" | "POSSIBLE" | "DIFFERENT" | "UNKNOWN";
export type Comparison = {
  id: string;
  verdict: Verdict;
  reason: string;
  source: "AI" | "TEXT" | "PHOTO" | "NONE";
};
/** 띄어쓰기와 문장부호가 다른 한국어 표현을 비교할 수 있게 연속 두 글자 집합을 만듭니다. */
function grams(text: string) {
  const value = text
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return new Set(
    Array.from({ length: Math.max(0, value.length - 1) }, (_, i) =>
      value.slice(i, i + 2),
    ),
  );
}
/** 제목·설명 간 Dice 유사도(0~1). 의미 모델을 대체하지 않으며 짧은 공통 단어만으로 일치시키지 않습니다. */
export function textSimilarity(a: string, b: string) {
  const x = grams(a),
    y = grams(b);
  if (x.size < 5 || y.size < 5) return 0;
  let common = 0;
  for (const item of x) if (y.has(item)) common++;
  return (2 * common) / (x.size + y.size);
}
/** 1. GPS 오차를 고려해 반경 150m를 찾습니다. 2. 텍스트·거리·유형으로 정렬해 가까운 무관 제보에 후보가 밀리지 않게 합니다. */
export function rankCandidates<T extends Comparable>(
  source: Comparable,
  rows: T[],
) {
  if (source.latitude === null || source.longitude === null) return [];
  return rows
    .filter(
      (x) => x.id !== source.id && x.latitude !== null && x.longitude !== null,
    )
    .map((report) => {
      const meters = distance(
        source.latitude!,
        source.longitude!,
        report.latitude!,
        report.longitude!,
      );
      const textScore = Math.max(
        textSimilarity(source.title, report.title),
        textSimilarity(source.description, report.description),
      );
      const rank =
        textScore * 0.65 +
        (1 - Math.min(meters / SIMILAR_RADIUS_METERS, 1)) * 0.25 +
        (source.riskType === report.riskType ? 0.1 : 0);
      return { report, meters, textScore, rank };
    })
    .filter((x) => x.meters <= SIMILAR_RADIUS_METERS)
    .sort((a, b) => b.rank - a.rank || a.meters - b.meters)
    .slice(0, SIMILAR_MAX_CANDIDATES);
}
/** AI 없이도 충분히 비슷한 문구는 후보로 안내합니다. 긴 거리·다른 유형은 확인 불가로 남겨 오탐을 줄입니다. */
export function localComparison(
  source: Comparable,
  candidate: ReturnType<typeof rankCandidates>[number],
  identicalPublicPhoto = false,
): Comparison {
  if (identicalPublicPhoto)
    return {
      id: candidate.report.id,
      verdict: "POSSIBLE",
      reason:
        "공개 동의된 기존 사진과 동일한 사진입니다. 위치와 실제 위험이 같은지 확인하세요.",
      source: "PHOTO",
    };
  if (
    candidate.textScore >= 0.72 &&
    candidate.meters <= 80 &&
    source.riskType === candidate.report.riskType
  )
    return {
      id: candidate.report.id,
      verdict: "POSSIBLE",
      reason:
        "제목 또는 설명이 매우 비슷하고 위험 유형이 같습니다. 문구 기반 후보이며 AI 확정 판단은 아닙니다.",
      source: "TEXT",
    };
  return {
    id: candidate.report.id,
    verdict: "UNKNOWN",
    reason:
      source.riskType === candidate.report.riskType
        ? "가까운 위치의 같은 유형입니다. 같은 시설·위험인지는 추가 확인이 필요합니다."
        : "근처의 다른 위험 유형입니다. 같은 위치라는 이유만으로 중복 처리하지 않습니다.",
    source: "NONE",
  };
}
/** 후보 누락·AI 실패를 ‘없음’으로 오인하지 않습니다. 모든 후보가 다른 위험이라고 비교된 경우에만 없음입니다. */
export function overallResult(items: Comparison[]) {
  return items.some((x) => x.verdict === "SAME" || x.verdict === "POSSIBLE")
    ? "중복 가능성 있음"
    : items.length && items.some((x) => x.verdict === "UNKNOWN")
      ? "확인 불가"
      : "유사 제보 없음";
}
