/** 모든 SafeReport API 진입점. 소유권·출처 검사 후 저장/분석을 수행하고 공개용 응답만 반환합니다. */
import { NextResponse } from "next/server";
import { z } from "zod";
import jpeg from "jpeg-js";
import {env} from "cloudflare:workers";
import {saveImage,loadImage,deleteImage} from "@/lib/storage";
import { randomUUID } from "node:crypto";


import {
  db,
  owner,
  checkOrigin,
  limit,
  access,
  normalize,
  publicReport,
  ownReport,
  body,
  editSchema,
  ai,
  ApiError,
} from "@/lib/server";
import { effectiveStatus } from "@/lib/rules";
import { findSimilar } from "@/lib/similar-server";
import { riskSchema, riskPrompt, riskInputChanged } from "@/lib/risk";
import {assistReport} from "@/lib/report-assistance";
import {recommendReporting} from "@/lib/reporting";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
/** 1. 경로와 출처를 검사합니다. 2. 기능별 권한/입력을 검증합니다. 3. 결과 또는 안전한 오류를 반환합니다. */
async function handle(req: Request, context: Context) {
  try {
    const { segments: s } = await context.params;
    const method = req.method;
    if (method !== "GET") checkOrigin(req);
    if (s[0] !== "reports") throw new ApiError(404, "없는 API입니다.");
    if (s[1] === "upload" && method === "POST") {
      const who = (await owner(true))!;
      limit("upload:" + who.id);
      if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
        throw new ApiError(413, "사진은 최대 10MB입니다.");
      const form = await req.formData();
      const file = form.get("image");
      if (
        !(file instanceof File) ||
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        throw new ApiError(400, "10MB 이하 JPEG, PNG, WebP 사진을 선택하세요.");
      if(file.type!=='image/jpeg')throw new ApiError(400,'사진을 화면에서 다시 선택해 주세요. 업로드 전 안전한 JPEG로 변환합니다.');
      let buffer:Uint8Array;
      try {const decoded=jpeg.decode(new Uint8Array(await file.arrayBuffer()),{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:64});buffer=jpeg.encode(decoded,85).data;}catch{throw new ApiError(400,'읽을 수 없는 사진입니다. 사진을 다시 선택해 주세요.');}
      const name=randomUUID()+'.jpg';await saveImage(name,buffer);
      try {
        const now = new Date();
        return json(
          ownReport(
            await db.report.create({
              data: {
                ownerId: who.id,
                imagePath: name,
                uploadedAt: now,
                expiresAt: new Date(+now + 600000),
              },
            }),
          ),
          201,
        );
      } catch (error) {
        await deleteImage(name);
        throw error;
      }
    }
    if (s[1] === "mine" && method === "GET") {
      const who = await owner();
      const rows = who
        ? await db.report.findMany({
            where: { ownerId: who.id },
            orderBy: { uploadedAt: "desc" },
          })
        : [];
      return json(
        await Promise.all(rows.map(async (r) => ownReport(await normalize(r)))),
      );
    }
    if (s[1] === "map" && method === "GET") {
      const rows = await db.report.findMany({
        where: { isPublic: true, isDraft: false },
        orderBy: { uploadedAt: "desc" },
      });
      return json(
        await Promise.all(
          rows.map(async (r) => publicReport(await normalize(r))),
        ),
      );
    }
    const id = s[1];
    if (!id) throw new ApiError(404, "제보 ID가 필요합니다.");
    const { report: r, isOwner } = await access(id, method !== "GET");
    const action = s[2];
    if (action === "image" && method === "GET") {
      if (!isOwner && !r.photoPublic)
        throw new ApiError(404, "비공개 사진입니다.");
      return new NextResponse(
        new Uint8Array(await loadImage(r.imagePath)),
        {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    if (!action && method === "GET")
      return json(
        isOwner
          ? {
              ...ownReport(r),
              history: await db.reportStatusHistory.findMany({
                where: { reportId: id },
                orderBy: { changedAt: "desc" },
              }),
            }
          : publicReport(r),
      );
    if (!action && method === "PATCH") {
      const data = await body(req, editSchema);
      // 관찰 내용·위치가 바뀌면 과거 AI 위험도는 더 이상 현재 입력의 평가가 아닙니다.
      const changed = riskInputChanged(
        r as unknown as Record<string, unknown>,
        data,
      );
      return json(
        ownReport(
          await db.report.update({
            where: { id },
            data: {
              ...data,
              ...(changed
                ? {
                    riskLevel: "UNKNOWN",
                    riskReason: r.riskAssessedAt
                      ? "입력이 변경되었습니다. AI 위험도를 다시 분석해 주세요."
                      : "",
                    riskAssessedAt: null,
                    riskModel: null,
                  }
                : {}),
            },
          }),
        ),
      );
    }
    if (!action && method === "DELETE") {
      await db.report.delete({ where: { id } });
      await deleteImage(r.imagePath).catch(() => {});
      return json({ deleted: true });
    }
    if ((action === "inspect" || action === "draft") && method === "POST") {
      await body(req, z.object({consent:z.literal(true)}).strict());
      if (r.latitude === null || r.longitude === null)
        throw new ApiError(400,"위치를 먼저 확인해 주세요.");
      return json(ownReport(await assistReport(r,action === "draft")));
    }
    if (action === "analyze" && method === "POST") {
      const input = await body(
        req,
        z.object({ consent: z.literal(true) }).strict(),
      );
      void input;
      limit("ai:" + r.ownerId);
      await db.report.update({
        where: { id },
        data: { aiConsentAt: new Date() },
      });
      const parsed = z
        .object({
          title: z.string().max(120),
          riskType: z.enum([
            "보행 위험",
            "도로·교통",
            "시설 파손",
            "전기·화재",
            "기타",
          ]),
          aiSummary: z.string().max(3000),
          draftText: z.string().max(6000),
        })
        .extend(riskSchema.shape)
        .safeParse(
          await ai(
            `위험 사진을 관찰하여 한국어 JSON {title,riskType,aiSummary,draftText,riskLevel,riskReason}를 작성. riskType은 보행 위험/도로·교통/시설 파손/전기·화재/기타 중 하나. draftText는 제목/위치/발견 상황/위험 설명/요청 사항을 포함. 보이지 않는 사실은 만들지 말 것. ${riskPrompt} 위치: ${r.locationLabel}, 사용자 설명: ${r.description}`,
            [r.imagePath],
          ),
        );
      if (!parsed.success)
        throw new ApiError(
          503,
          "AI 결과를 검증하지 못했습니다. 직접 입력해 주세요.",
        );
      return json(
        ownReport(
          await db.report.update({
            where: { id },
            data: {
              ...parsed.data,
              description: r.description.trim() || parsed.data.aiSummary,
              riskAssessedAt: new Date(),
              riskModel:
                env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            },
          }),
        ),
      );
    }
    if (action === "similar" && method === "POST") {
      const input = await body(
        req,
        z.object({ useAI: z.boolean().default(false) }).strict(),
      );
      return json(await findSimilar(r, input.useAI));
    }
    if (action === "risk" && method === "POST") {
      // 1. 기존 제보도 작성자가 이번 전송에 동의한 경우에만 분석합니다.
      await body(req, z.object({ consent: z.literal(true) }).strict());
      limit("ai:" + r.ownerId);
      await db.report.update({
        where: { id },
        data: { aiConsentAt: new Date() },
      });
      // 2. 신고 상태·제보 건수 없이 관찰 근거만 평가하며 결과 스키마를 검사합니다.
      const parsed = riskSchema.safeParse(
        await ai(
          "사진과 사용자 설명으로 생활안전 위험도를 평가하여 JSON {riskLevel,riskReason}를 반환. " +
            riskPrompt +
            " 사용자 관찰:" +
            JSON.stringify({
              title: r.title,
              description: r.description,
              riskType: r.riskType,
              summary: r.aiSummary,
            }),
          [r.imagePath],
        ),
      );
      if (!parsed.success)
        throw new ApiError(
          503,
          "AI 위험도 응답을 확인하지 못했습니다. 현재 평가를 유지합니다.",
        );
      // 3. 같은 사진의 관찰 내용을 저장하고 공개 여부는 기존 동의를 유지합니다.
      const latest = await db.report.findUniqueOrThrow({ where: { id } });
      if (
        riskInputChanged(
          r as unknown as Record<string, unknown>,
          latest as unknown as Record<string, unknown>,
        )
      )
        throw new ApiError(
          409,
          "분석 중 내용이 변경되었습니다. 다시 분석하세요.",
        );
      return json(
        ownReport(
          await db.report.update({
            where: { id },
            data: {
              ...parsed.data,
              riskAssessedAt: new Date(),
              riskModel:
                env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            },
          }),
        ),
      );
    }
    if (action === "publish" && method === "POST") {
      const input = await body(
        req,
        z
          .object({
            isPublic: z.boolean(),
            photoPublic: z.boolean(),
            photoConfirmed: z.boolean(),
          })
          .strict(),
      );
      if (
        r.latitude === null ||
        r.longitude === null ||
        !r.title.trim() ||
        !r.description.trim()
      )
        throw new ApiError(400, "위치, 제목, 위험 설명을 입력하세요.");
      if (input.photoPublic && (!input.isPublic || !input.photoConfirmed))
        throw new ApiError(
          400,
          "사진 공개는 요약 공개 동의와 추가 확인이 필요합니다.",
        );
      const now = new Date();
      return json(
        ownReport(
          await db.report.update({
            where: { id },
            data: {
              isDraft: false,
              isPublic: input.isPublic,
              photoPublic: input.photoPublic,
              publicConsentAt: input.isPublic ? now : null,
              photoConsentAt: input.photoPublic ? now : null,
            },
          }),
        ),
      );
    }
    if (action === "visibility" && method === "PATCH") {
      const input = await body(
        req,
        z
          .object({
            isPublic: z.boolean(),
            photoPublic: z.boolean(),
            photoConfirmed: z.boolean(),
          })
          .strict(),
      );
      if (r.isDraft)
        throw new ApiError(400, "초안은 신고 진행 후 공개할 수 있습니다.");
      if (input.photoPublic && (!input.isPublic || !input.photoConfirmed))
        throw new ApiError(400, "사진 공개를 추가 확인하세요.");
      const now = new Date();
      return json(
        ownReport(
          await db.report.update({
            where: { id },
            data: {
              isPublic: input.isPublic,
              photoPublic: input.photoPublic,
              publicConsentAt: input.isPublic ? r.publicConsentAt || now : null,
              photoConsentAt: input.photoPublic
                ? r.photoConsentAt || now
                : null,
            },
          }),
        ),
      );
    }
    if (action === "status" && method === "PATCH") {
      const input = await body(
        req,
        z.object({ reported: z.boolean() }).strict(),
      );
      if (r.isDraft) throw new ApiError(400, "먼저 신고 진행을 눌러 주세요.");
      const status = input.reported
        ? "USER_REPORTED"
        : effectiveStatus("PREPARING", r.expiresAt);
      const updated=await db.report.update({where:{id},data:{status,userReportedAt:input.reported?new Date():null,statusChangeSource:'USER'}});
      return json(ownReport(updated));
    }
    if (action === "office" && method === "GET") {
      if(!isOwner) throw new ApiError(404,"추천을 조회할 권한이 없습니다.");
      return json(recommendReporting(r));
    }
    throw new ApiError(404, "없는 API입니다.");
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    return json(
      { error: "요청을 처리하지 못했습니다. 입력과 서버 상태를 확인하세요." },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
