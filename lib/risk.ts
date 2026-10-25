/** AI 위험도 표시와 입력 변경 시 무효화 규칙. 사고 확률·제보 건수와 구분합니다. */
import { z } from "zod";
export const riskLabels: Record<string, string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
  UNKNOWN: "판단 불가",
};
export const riskColors: Record<string, string> = {
  LOW: "#168369",
  MEDIUM: "#b77911",
  HIGH: "#d34648",
  UNKNOWN: "#7a899b",
};
export const riskSchema = z.object({
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  riskReason: z.string().trim().min(1).max(600),
});
export const riskPrompt = `위험도도 함께 평가하라. riskLevel은 LOW/MEDIUM/HIGH/UNKNOWN, riskReason은 한국어 2문장 이내. HIGH: 사람이 심각하게 다칠 가능성이 관찰되며 즉각 접근을 피하거나 조치가 필요한 노출 전선·큰 추락 위험·붕괴 징후 등. MEDIUM: 넘어짐·파손 등 주의와 점검이 필요한 관찰 근거. LOW: 관찰된 영향이 경미하고 즉각 위험 근거가 적음. UNKNOWN: 사진·설명으로 평가할 근거가 부족하거나 서로 모순됨. 단순 제보 수, 신고 완료 여부, 시설 이름만으로 위험도를 높이거나 안전을 보증하지 마라. 사진의 합성 여부와 불확실성을 고려하고 실제 관찰에 없는 심각성을 만들지 마라. 이유에는 개인 식별 정보·정확한 주소·전화번호를 쓰지 마라. 현장 확인이 필요한 추정임을 명시하라.`;
/** 입력의 실질적 변경만 판별해 단순 저장·신고 상태 변경 시 불필요하게 분석을 지우지 않습니다. */
export function riskInputChanged(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  return [
    "title",
    "description",
    "riskType",
    "aiSummary",
    "latitude",
    "longitude",
    "locationLabel",
    "placeType",
  ].some((key) => patch[key] !== undefined && patch[key] !== before[key]);
}
/** 근접 그룹은 개별 평가 중 가장 높은 값을 대표색으로 씁니다. UNKNOWN은 안전하다는 뜻이 아닙니다. */
export function groupRisk(levels: string[]) {
  return levels.includes("HIGH")
    ? "HIGH"
    : levels.includes("MEDIUM")
      ? "MEDIUM"
      : levels.includes("LOW")
        ? "LOW"
        : "UNKNOWN";
}
