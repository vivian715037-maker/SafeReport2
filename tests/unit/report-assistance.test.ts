/** 간편 흐름의 AI 관찰·신고문 생성은 동의된 자료만 쓰고 입력 변경·잘못된 응답을 거부하는지 검사합니다. */
import { beforeEach, it, expect, vi } from "vitest";
import type { Report } from "@prisma/client";
const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  update: vi.fn(),
  latest: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../../src/lib/server", () => ({
  ai: mocks.ai,
  limit: mocks.limit,
  db: {
    report: { update: mocks.update },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ report: { findUniqueOrThrow: mocks.latest, update: mocks.update } }),
  },
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
import { assistReport } from "../../src/lib/report-assistance";
const source = {
  id: "fake",
  ownerId: "owner",
  title: "",
  description: "보도블록이 깨져 있습니다.",
  riskType: "기타",
  latitude: 37,
  longitude: 127,
  locationLabel: "가상 보도",
  imagePath: "fake.jpg",
} as Report;
const observation = {
  riskType: "보행 위험",
  placeType: "공공시설",
  aiSummary: "균열이 관찰됩니다.",
  riskLevel: "MEDIUM",
  riskReason: "보행 시 넘어질 위험 추정. 현장 확인 필요.",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.latest.mockResolvedValue(source);
  mocks.update.mockImplementation(async ({ data }) => ({ ...source, ...data }));
});
it("관찰 분석에서는 제목·신고문을 만들지 않고 위험 분류만 저장한다", async () => {
  mocks.ai.mockResolvedValue(observation);
  const result = await assistReport(source, false);
  expect(result.riskType).toBe("보행 위험");
  expect(result.title).toBe("");
  expect(mocks.ai.mock.calls[0][1]).toEqual(["fake.jpg"]);
});
it("네 번째 화면 요청은 제목·신고문과 위험도를 함께 저장한다", async () => {
  mocks.ai.mockResolvedValue({
    ...observation,
    title: "가상 보도블록 점검 요청",
    draftText: "바닥 파손을 확인하고 조치해 주세요.",
  });
  const result = await assistReport(source, true);
  expect(result.title).toContain("점검");
  expect(result.draftText).toContain("조치");
  expect(result.riskAssessedAt).toBeInstanceOf(Date);
});
it("잘못된 결과와 처리 중 바뀐 내용을 저장하지 않는다", async () => {
  mocks.ai.mockResolvedValue({ title: "형식 오류" });
  await expect(assistReport(source, true)).rejects.toMatchObject({
    status: 503,
  });
  expect(mocks.update).toHaveBeenCalledTimes(1);
  mocks.ai.mockResolvedValue(observation);
  mocks.latest.mockResolvedValue({
    ...source,
    description: "다른 내용으로 수정됨",
  });
  await expect(assistReport(source, false)).rejects.toMatchObject({
    status: 409,
  });
});
