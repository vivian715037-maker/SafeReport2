/** 실제 HTTP 권한·저장·사진 공개와 모바일 화면 흐름을 분리된 DB에서 검사합니다. */
import { test, expect, request as playwrightRequest } from "@playwright/test";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
const origin = "http://127.0.0.1:3001";
const headers = { Origin: origin };
const database = new PrismaClient({
  datasourceUrl: "file:" + path.resolve("prisma/test.db").replaceAll("\\", "/"),
});
async function photo() {
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: "#d8e5f4" },
  })
    .jpeg()
    .toBuffer();
}
/** 테스트는 임의의 가짜 사진만 사용합니다. */
test("권한·중복 후보·사진 공개·만료·삭제를 실제 API로 검증", async () => {
  const a = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const b = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const upload = async (ctx: typeof a) => {
    const res = await ctx.post("/api/reports/upload", {
      multipart: {
        image: {
          name: "fake.jpg",
          mimeType: "image/jpeg",
          buffer: await photo(),
        },
      },
    });
    expect(res.status()).toBe(201);
    return res.json();
  };
  const r = await upload(a);
  try {
    expect((await a.get("/api/locations?q=x")).status()).toBe(400);
    expect((await a.get("/api/locations?region=unknown")).status()).toBe(400);
    expect(
      (
        await b.post("/api/reports/" + r.id + "/draft", {
          data: { consent: true },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/inspect", {
          data: { consent: false },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/draft", {
          data: { consent: true },
        })
      ).status(),
    ).toBe(400);
    expect((await b.get("/api/reports/" + r.id)).status()).toBe(404);
    expect((await b.get("/api/reports/" + r.id + "/office")).status()).toBe(
      404,
    );
    expect(
      (
        await b.post("/api/reports/" + r.id + "/risk", {
          data: { consent: true },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/risk", {
          data: { consent: false },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.patch("/api/reports/" + r.id, { data: { riskLevel: "HIGH" } })
      ).status(),
    ).toBe(400);
    expect(
      (
        await b.patch("/api/reports/" + r.id + "/status", {
          data: { reported: true },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await a.patch("/api/reports/" + r.id, {
          headers: { Origin: "https://example.com" },
          data: { title: "변경" },
        })
      ).status(),
    ).toBe(403);
    await expect((await a.get("/api/reports/map")).json()).resolves.toEqual([]);
    expect(
      (
        await a.post("/api/reports/upload", {
          multipart: {
            image: {
              name: "bad.jpg",
              mimeType: "image/jpeg",
              buffer: Buffer.from("not an image"),
            },
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.patch("/api/reports/" + r.id, { data: { latitude: 999 } })
      ).status(),
    ).toBe(400);
    await a.patch("/api/reports/" + r.id, {
      data: {
        latitude: 37.5665123,
        longitude: 126.9780123,
        title: "깨진 보도블록",
        description: "[테스트] 바닥에 균열이 있습니다.",
        riskType: "보행 위험",
      },
    });
    const absent = await a.post("/api/reports/" + r.id + "/similar", {
      data: { useAI: false },
    });
    expect((await absent.json()).result).toBe("유사 제보 없음");
    const office = await (
      await a.get("/api/reports/" + r.id + "/office")
    ).json();
    expect(office.recommendations[0].channel.id).toBe("safety");
    expect(office.recommendations[0].channel.source.url).toContain(
      "mois.go.kr",
    );
    expect(JSON.stringify(office)).not.toContain("37.5665123");
    expect(
      (
        await a.patch("/api/reports/" + r.id, {
          data: { agency: "가짜 기관", url: "https://evil.example" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/analyze", {
          data: { consent: false },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/analyze", {
          data: { consent: true },
        })
      ).status(),
    ).toBe(503);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/publish", {
          data: { isPublic: true, photoPublic: true, photoConfirmed: false },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await a.post("/api/reports/" + r.id + "/publish", {
          data: { isPublic: true, photoPublic: false, photoConfirmed: false },
        })
      ).ok(),
    ).toBeTruthy();
    const visible = await (await b.get("/api/reports/" + r.id)).json();
    // 공개 제보여도 비공개 관찰·위치에서 계산한 추천 근거를 타인에게 노출하지 않습니다.
    expect((await b.get("/api/reports/" + r.id + "/office")).status()).toBe(
      404,
    );
    expect(visible.riskLevel).toBe("UNKNOWN");
    expect(visible.latitude).not.toBe(37.5665123);
    for (const field of [
      "ownerId",
      "imagePath",
      "locationLabel",
      "draftText",
      "aiConsentAt",
      "expiresAt",
    ])
      expect(visible).not.toHaveProperty(field);
    expect((await b.get("/api/reports/" + r.id + "/image")).status()).toBe(404);
    const candidate = await upload(b);
    await b.patch("/api/reports/" + candidate.id, {
      data: {
        latitude: 37.56652,
        longitude: 126.97802,
        title: "다른 제보",
        description: "[테스트] 근처 위험",
        riskType: "보행 위험",
      },
    });
    let results = await (
      await b.post("/api/reports/" + candidate.id + "/similar", {
        data: { useAI: false },
      })
    ).json();
    expect(results.result).toBe("확인 불가");
    expect(results.candidates[0].sameType).toBe(true);
    await b.patch("/api/reports/" + candidate.id, {
      data: { riskType: "전기·화재" },
    });
    results = await (
      await b.post("/api/reports/" + candidate.id + "/similar", {
        data: { useAI: false },
      })
    ).json();
    expect(results.candidates[0].sameType).toBe(false);
    const withoutPriorAnalysis = await b.post(
      "/api/reports/" + candidate.id + "/similar",
      { data: { useAI: true } },
    );
    expect(withoutPriorAnalysis.status()).toBe(200);
    expect((await withoutPriorAnalysis.json()).reason).toContain("문구");
    await b.delete("/api/reports/" + candidate.id);
    // AI 응답을 흉내 내는 전용 DB 설정이며 실제 AI 분석 성공으로 보고하지 않습니다.
    await database.report.update({
      where: { id: r.id },
      data: {
        riskLevel: "HIGH",
        riskReason: "[테스트] 추락 위험이 관찰됨. 현장 확인 필요.",
        riskAssessedAt: new Date(),
      },
    });
    await a.patch("/api/reports/" + r.id + "/status", {
      data: { reported: true },
    });
    expect((await (await b.get("/api/reports/" + r.id)).json()).riskLevel).toBe(
      "HIGH",
    );
    await a.patch("/api/reports/" + r.id + "/status", {
      data: { reported: false },
    });
    await a.patch("/api/reports/" + r.id, {
      data: { description: "[테스트] 관찰 내용이 변경됨" },
    });
    expect((await (await b.get("/api/reports/" + r.id)).json()).riskLevel).toBe(
      "UNKNOWN",
    );
    expect(
      (
        await a.post("/api/reports/" + r.id + "/risk", {
          data: { consent: true },
        })
      ).status(),
    ).toBe(503);
    await a.patch("/api/reports/" + r.id + "/visibility", {
      data: { isPublic: true, photoPublic: true, photoConfirmed: true },
    });
    expect((await b.get("/api/reports/" + r.id + "/image")).status()).toBe(200);
    await a.patch("/api/reports/" + r.id + "/visibility", {
      data: { isPublic: true, photoPublic: false, photoConfirmed: false },
    });
    expect((await b.get("/api/reports/" + r.id + "/image")).status()).toBe(404);
    await database.report.update({
      where: { id: r.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await (await a.get("/api/reports/" + r.id)).json()).status).toBe(
      "INCOMPLETE",
    );
    await a.patch("/api/reports/" + r.id + "/status", {
      data: { reported: true },
    });
    expect((await (await a.get("/api/reports/" + r.id)).json()).status).toBe(
      "USER_REPORTED",
    );
    await a.patch("/api/reports/" + r.id + "/status", {
      data: { reported: false },
    });
    expect((await (await a.get("/api/reports/" + r.id)).json()).status).toBe(
      "INCOMPLETE",
    );
    expect(
      await database.reportStatusHistory.count({ where: { reportId: r.id } }),
    ).toBeGreaterThanOrEqual(3);
  } finally {
    await a.delete("/api/reports/" + r.id);
    await a.dispose();
    await b.dispose();
    await database.$disconnect();
  }
});
test("용량 제한과 브라우저별 업로드 호출 제한", async () => {
  const client = await playwrightRequest.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  try {
    const large = await client.post("/api/reports/upload", {
      multipart: {
        image: {
          name: "huge.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
        },
      },
    });
    expect(large.status()).toBe(400);
    for (let i = 0; i < 4; i++)
      expect(
        (
          await client.post("/api/reports/upload", {
            multipart: {
              image: {
                name: "invalid.jpg",
                mimeType: "image/jpeg",
                buffer: Buffer.from("invalid"),
              },
            },
          })
        ).status(),
      ).toBe(400);
    expect(
      (
        await client.post("/api/reports/upload", {
          multipart: {
            image: {
              name: "invalid.jpg",
              mimeType: "image/jpeg",
              buffer: Buffer.from("invalid"),
            },
          },
        })
      ).status(),
    ).toBe(429);
  } finally {
    await client.dispose();
  }
});
// 화면 계약이 4단계 간편 흐름으로 바뀌어 기존 UI 시나리오를 새 사용 흐름으로 갱신합니다.
test("간편 4단계·검색 선택·AI 실패 대체·전국 지도 즉시 표시", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const location = {
    id: "mock-place",
    name: "[테스트] 서울시청 앞 보도",
    latitude: 37.5665,
    longitude: 126.978,
    bounds: [
      [37.55, 126.96],
      [37.58, 126.99],
    ],
  };
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({
      json: route.request().url().includes("region=")
        ? { ...location, id: "mock-region", name: "서울특별시 중구" }
        : [location],
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /사진 한 장으로/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "사진 올리고 시작하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "현장 사진 등록" }),
  ).toBeVisible();
  await page.getByLabel("위험 사진 선택").setInputFiles({
    name: "fake.jpg",
    mimeType: "image/jpeg",
    buffer: await photo(),
  });
  await page.getByRole("button", { name: "위치 확인으로" }).click();
  await expect(
    page.getByRole("heading", { name: "발견 위치 확인" }),
  ).toBeVisible();
  await expect(page.getByLabel("위도", { exact: true })).not.toBeVisible();
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, error) =>
      error?.({ code: 1, message: "denied" } as GeolocationPositionError);
  });
  await page.getByRole("button", { name: "⌖ GPS로 현재 위치 찾기" }).click();
  await expect(page.locator(".sr-alert.sr-error")).toContainText(
    "아래에서 장소를 검색",
  );
  await page.getByLabel("장소 이름이나 주소로 찾기").fill("서울시청");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("button", { name: /서울시청 앞 보도.*선택/ }).click();
  await expect(page.getByLabel("장소 설명")).toHaveValue(
    "[테스트] 서울시청 앞 보도",
  );
  await page.getByRole("button", { name: "위치 확인 · 다음" }).click();
  await expect(
    page.getByRole("heading", { name: "발견 상황 및 유사 제보 확인" }),
  ).toBeVisible();
  await expect(page.getByLabel("위험 유형", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("제목", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("발견한 상황")
    .fill("가상 검증: 불이 나고 연기가 치솟고 있습니다.");
  await expect(
    page.getByRole("link", { name: "119 화재·구조·구급 전화하기" }),
  ).toHaveAttribute("href", "tel:119");
  await expect(page.getByRole("link", { name: /112.*전화하기/ })).toHaveCount(
    0,
  );
  await page
    .getByLabel("발견한 상황")
    .fill("가상 검증: 소화전 앞에 불법 주차한 차량이 있어요.");
  await expect(
    page.getByRole("complementary", { name: "긴급 연락 안내" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "확인하고 다음" }).click();
  await expect(page.locator(".sr-routing-caution")).toContainText("공식 앱");
  await expect(page.locator(".sr-routing-card")).toHaveCount(1);
  await page.getByText("신고 대상·공식 출처", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: /행정안전부 안전신문고 업무 안내/ }),
  ).toHaveAttribute(
    "href",
    "https://www.mois.go.kr/frt/sub/a06/b10/safetyReport/screen.do",
  );
  await page.screenshot({
    path: "test-results/reporting-mobile-parking.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "← 이전 화면", exact: true }).click();
  await page
    .getByLabel("발견한 상황")
    .fill("[데모] 보도블록이 깨져서 넘어질 수 있어요.");
  await page.getByRole("button", { name: "앱 내 유사 제보 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "유사 제보 없음" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "확인하고 다음" }).click();
  await expect(
    page.getByRole("link", { name: "안전신문고 열기" }),
  ).toHaveAttribute("href", "https://www.safetyreport.go.kr/");
  await page
    .getByRole("checkbox", { name: /사진·위치·설명을 외부 AI/ })
    .check();
  await page.getByRole("button", { name: "✧ AI로 신고문 작성하기" }).click();
  await expect(page.locator(".sr-alert.sr-error")).toContainText("AI 키");
  await page
    .getByLabel("제목", { exact: true })
    .fill("[데모] 보도블록 점검 요청");
  await page
    .getByLabel("신고 내용", { exact: true })
    .fill(
      "[데모] 서울시청 앞 보도블록 파손을 확인하고 필요한 조치를 부탁드립니다.",
    );
  await page
    .getByRole("checkbox", { name: /사진·위치·설명을 외부 AI/ })
    .uncheck();
  await page
    .getByText("지도 공개 범위 선택 (선택 사항)", { exact: true })
    .click();
  await page.getByRole("checkbox", { name: /내용 요약·대략적인 위치/ }).check();
  await page.getByRole("checkbox", { name: /사진도 공개합니다/ }).check();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "사진 공개에 동의합니다" }).click();
  await page.getByRole("button", { name: "내 기록에 보관하기" }).click();
  await expect(
    page.getByRole("heading", { name: "[데모] 보도블록 점검 요청" }),
  ).toBeVisible();
  // 지도 색상 검사에만 쓰는 가짜 평가이며 실제 AI 성능 검증과 구분합니다.
  await database.report.updateMany({
    where: { title: "[데모] 보도블록 점검 요청" },
    data: {
      riskLevel: "HIGH",
      riskReason: "[테스트] 넘어짐 위험. 현장 확인 필요.",
      riskAssessedAt: new Date(),
    },
  });
  await page.getByRole("button", { name: "위험 지도", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "전국 위험 지도" }),
  ).toBeVisible();
  await expect(page.getByLabel("시·도 선택")).toHaveCount(0);
  await expect(page.getByLabel("시·군·구 선택")).toHaveCount(0);
  await expect(page.locator(".map-marker").first()).toBeVisible();
  await page.getByRole("button", { name: "전국 보기", exact: true }).click();
  await page.getByRole("button", { name: "높음", exact: true }).click();
  await expect(page.locator(".map-marker span").first()).toHaveCSS(
    "background-color",
    "rgb(211, 70, 72)",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/simple-mobile-map.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /보도블록 점검 요청.*자세히 보기/ })
    .click();
  await page.getByText("기록 상태와 공개 범위 관리", { exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "이 기록 삭제" }).click();
  await expect(
    page.getByRole("heading", { name: "내 기록", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
