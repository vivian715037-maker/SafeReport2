/** 서버 중복 비교: 공개 후보만 선정하고 동의된 사진·설명으로 비교하며 같은 입력의 AI 결과를 잠시 재사용합니다. */
import type {Report} from "./database";
import { createHash } from "node:crypto";
import {loadImage} from "./storage";

import { z } from "zod";
import {
  db,
  ai,
  limit,
  normalize,
  publicReport,
  ApiError,
} from "./server";
import {
  rankCandidates,
  localComparison,
  overallResult,
  type Comparison,
  SIMILAR_RADIUS_METERS,
} from "./similarity";
const cache = new Map<string, { expires: number; comparisons: Comparison[] }>();
/** 1. 원본 좌표로 가까운 공개 제보를 선별합니다. 2. 명시적 동의가 있으면 AI를 비교합니다. 3. 공개 가능한 후보와 근거만 반환합니다.
 * @param useAI 이번 요청에서 외부 AI 전송에 동의했는지. 과거 사진 분석 버튼 사용 여부와 무관합니다.
 * @returns 후보별 판정·근거 및 전체 결과. AI 실패 시 문구/공개 동일 사진 근거를 남기고 비교 실패를 표시합니다.
 */
export async function findSimilar(source: Report, useAI: boolean) {
  if (source.latitude === null || source.longitude === null)
    throw new ApiError(400, "위치를 먼저 선택하세요.");
  // 1. 초안·비공개는 후보에서 제외하며 유형이 달라도 사진·내용이 같을 수 있어 일괄 제외하지 않습니다.
  const rows = await db.report.findMany({
    where: {
      id: { not: source.id },
      isPublic: true,
      isDraft: false,
      latitude: { not: null },
      longitude: { not: null },
    },
  });
  const ranked = rankCandidates(source, rows);
  if (!ranked.length)
    return {
      result: "유사 제보 없음",
      reason: `앱의 공개 제보 중 ${SIMILAR_RADIUS_METERS}m 이내 후보가 없습니다. 비공개·초안은 검색하지 않습니다.`,
      candidates: [],
      aiUsed: false,
      cached: false,
    };
  const sourceHash = createHash("sha256")
    .update(await loadImage(source.imagePath))
    .digest("hex");
  let comparisons = await Promise.all(
    ranked.map(async (item) => {
      let identical = false;
      if (item.report.photoPublic) {
        try {
          identical =
            sourceHash ===
            createHash("sha256")
              .update(await loadImage(item.report.imagePath))
              .digest("hex");
        } catch {
          /* 사진 파일이 없으면 텍스트 후보로 남기며 비공개 사진은 읽지 않습니다. */
        }
      }
      return localComparison(source, item, identical);
    }),
  );
  let aiUsed = false,
    cached = false,
    aiError = "";
  // 2. 캐시는 현재 공개 동의와 내용·좌표가 같은 경우에만 재사용합니다. 상태 변경은 의미 판단을 바꾸지 않습니다.
  if (useAI) {
    await db.report.update({
      where: { id: source.id },
      data: { aiConsentAt: new Date() },
    });
    const candidateData = ranked.map((x) => ({
      id: x.report.id,
      title: x.report.title,
      description: x.report.description,
      riskType: x.report.riskType,
      latitude: x.report.latitude,
      longitude: x.report.longitude,
      photoPublic: x.report.photoPublic,
      imagePath: x.report.photoPublic ? x.report.imagePath : null,
    }));
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          id: source.id,
          title: source.title,
          description: source.description,
          aiSummary: source.aiSummary,
          riskType: source.riskType,
          latitude: source.latitude,
          longitude: source.longitude,
          image: sourceHash,
          candidates: candidateData,
        }),
      )
      .digest("hex");
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
    const previous = cache.get(key);
    if (previous) {
      comparisons = previous.comparisons;
      aiUsed = true;
      cached = true;
    } else
      try {
        limit("ai:" + source.ownerId);
        const photoCandidates = ranked
          .filter((x) => x.report.photoPublic)
          .slice(0, 4);
        const parsed = z
          .object({
            comparisons: z
              .array(
                z.object({
                  id: z.string(),
                  verdict: z.enum(["SAME", "POSSIBLE", "DIFFERENT", "UNKNOWN"]),
                  reason: z.string().min(1).max(400),
                }),
              )
              .max(8),
          })
          .safeParse(
            await ai(
              `가까운 생활안전 제보가 같은 시설의 같은 위험인지 후보별 비교. JSON {comparisons:[{id,verdict,reason}]}만 반환. 모든 후보에 답하라. SAME=동일한 대상·손상에 강한 근거, POSSIBLE=가능성 있지만 현장 확인 필요, DIFFERENT=구체적으로 다른 위험/시설, UNKNOWN=근거 부족. 같은 위치/같은 위험 유형만으로 SAME 금지. 제목·설명의 표현이 달라도 같은 손상일 수 있다. 서로 다른 위험 유형 분류만으로 DIFFERENT 금지. 첫 사진은 새 제보, 나머지 사진은 photoIds 순서. 사진이 없는 후보는 제목·설명으로 비교하고 사진을 봤다고 쓰지 마라. 이유는 한국어 1문장, 개인정보와 정확한 주소 금지. 새 제보:${JSON.stringify({ title: source.title, description: source.description, summary: source.aiSummary, riskType: source.riskType })}. 후보:${JSON.stringify(ranked.map((x) => ({ id: x.report.id, title: x.report.title, description: x.report.description, riskType: x.report.riskType, distanceBand: x.meters <= 50 ? "50m 이내" : "50~150m" })))}. photoIds:${JSON.stringify(photoCandidates.map((x) => x.report.id))}`,
              [
                source.imagePath,
                ...photoCandidates.map((x) => x.report.imagePath),
              ],
            ),
          );
        if (!parsed.success)
          throw new ApiError(503, "AI 비교 결과 형식을 확인하지 못했습니다.");
        const seen = new Set<string>();
        comparisons = comparisons.map((fallback) => {
          const match = parsed.data.comparisons.find(
            (x) => x.id === fallback.id,
          );
          if (!match || seen.has(match.id)) return fallback;
          seen.add(match.id);
          return { ...match, source: "AI" as const };
        });
        if (!seen.size)
          throw new ApiError(
            503,
            "AI가 후보에 대응하는 비교 결과를 반환하지 않았습니다.",
          );
        aiUsed = true;
        if (seen.size === ranked.length)
          cache.set(key, { expires: Date.now() + 300000, comparisons });
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
      } catch (error) {
        aiError =
          error instanceof ApiError ? error.message : "AI 비교에 실패했습니다.";
      }
  }
  // 3. 거리 숫자 대신 구간을 공개해 원본 좌표 역추정을 줄이며 후보의 개별 근거를 표시합니다.
  const result = overallResult(comparisons);
  return {
    result,
    aiUsed,
    cached,
    reason: aiError
      ? `${aiError} 문구·공개 동일 사진 근거와 후보를 직접 확인하세요.`
      : aiUsed
        ? `AI가 후보별 대상과 위험을 비교했습니다.${cached ? " 같은 입력의 직전 결과입니다." : ""}`
        : "AI 비교 없이 문구·공개 동일 사진을 확인했습니다. 결과는 후보 안내입니다.",
    candidates: await Promise.all(
      ranked.map(async (item, index) => ({
        ...publicReport(await normalize(item.report)),
        sameType: item.report.riskType === source.riskType,
        matched: ["SAME", "POSSIBLE"].includes(comparisons[index].verdict),
        comparison: comparisons[index],
        distanceBand:
          item.meters <= 50 ? "50m 이내" : "50~150m (GPS 오차 고려)",
      })),
    ),
  };
}
