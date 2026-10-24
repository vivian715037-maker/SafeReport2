/** 간편 4단계용 AI 처리. 상황 확인과 신고문 작성을 분리하고 입력 중 수정된 기록을 덮어쓰지 않습니다. */
import type { Report } from "@prisma/client";
import { z } from "zod";
import { ai, ApiError, db, limit } from "./server";
import { riskSchema, riskPrompt, riskInputChanged } from "./risk";
const observationSchema = z
  .object({
    riskType: z.enum([
      "보행 위험",
      "도로·교통",
      "시설 파손",
      "전기·화재",
      "기타",
    ]),
    placeType: z.enum(["공공시설", "학교", "사유시설"]),
    aiSummary: z.string().max(3000),
  })
  .extend(riskSchema.shape)
  .strict();
/** 1. 관찰 자료를 평가합니다. 2. 결과를 검증합니다. 3. 입력이 그대로인 경우에만 저장합니다.
 * @param draft true이면 사용자가 요청한 네 번째 화면의 제목·신고 내용도 함께 만듭니다.
 * @throws {ApiError} AI 실패·응답 오류 또는 분석 중 입력 변경 시 기존 입력을 유지하며 오류를 반환합니다.
 */
export async function assistReport(report: Report, draft: boolean) {
  limit("ai:" + report.ownerId);
  await db.report.update({
    where: { id: report.id },
    data: { aiConsentAt: new Date() },
  });
  const fields = draft
    ? "title,draftText,riskType,placeType,aiSummary,riskLevel,riskReason"
    : "riskType,placeType,aiSummary,riskLevel,riskReason";
  const prompt = `사용자의 생활안전 신고 준비를 도와라. JSON {${fields}}만 반환. riskType은 보행 위험/도로·교통/시설 파손/전기·화재/기타. placeType은 공공시설/학교/사유시설. 장소 설명과 관찰로 학교 내부나 사유시설임이 분명할 때만 해당 분류를 쓰고 그 외에는 공공시설. aiSummary는 사진에서 실제 관찰한 대상·손상·도로와 건물 내부 여부·주정차와 전력 공급 설비의 관련 여부를 간단히 요약하라. 보이지 않는 사항은 불명으로 표시하고 설명과 사진이 충돌하면 명시하라. 기관명·신고처·연락처·URL은 어떤 필드에도 생성하지 마라. 신고처는 별도의 검증된 DB로만 결정한다. ${riskPrompt} ${draft ? "title은 60자 이내의 객관적인 신고 제목, draftText는 제목을 반복하지 않는 신고 내용이다. 위치, 발견한 상황, 예상되는 위험, 현장 확인·조치 요청을 자연스러운 정중한 한국어로 작성하라. 접수 완료·자동 신고를 주장하지 말고 개인정보·전화번호·확인 안 된 사실을 만들지 마라." : ""} 사용자 자료:${JSON.stringify({ location: report.locationLabel, latitude: report.latitude, longitude: report.longitude, riskType: report.riskType, description: report.description })}`;
  const value = await ai(prompt, [report.imagePath]);
  const parsed = (
    draft
      ? observationSchema.extend({
          title: z.string().trim().min(1).max(120),
          draftText: z.string().trim().min(1).max(6000),
        })
      : observationSchema
  ).safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      503,
      "AI 결과를 확인하지 못했습니다. 직접 적거나 다시 시도해 주세요.",
    );
  return db.$transaction(async (tx) => {
    const latest = await tx.report.findUniqueOrThrow({
      where: { id: report.id },
    });
    if (
      riskInputChanged(
        report as unknown as Record<string, unknown>,
        latest as unknown as Record<string, unknown>,
      )
    )
      throw new ApiError(
        409,
        "분석하는 동안 내용이 바뀌었습니다. 다시 눌러 주세요.",
      );
    return tx.report.update({
      where: { id: report.id },
      data: {
        ...parsed.data,
        riskAssessedAt: new Date(),
        riskModel: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
      },
    });
  });
}
