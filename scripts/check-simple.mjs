/** 간편 화면의 실제 위치 검색·AI 신고문·복사·지역 지도를 합성 사진으로 검증합니다. AI 호출은 1회입니다. */
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const baseURL = "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let id;
try {
  await mkdir("evidence", { recursive: true });
  await page.goto(baseURL);
  await page.screenshot({
    path: "evidence/simple-home-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "사진 올리고 시작하기", exact: true })
    .click();
  const buffer = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500"><rect width="700" height="500" fill="#c1c6c8"/><path d="M0 120H700M0 240H700M0 360H700M140 0V500M280 0V500M420 0V500M560 0V500" stroke="#899195" stroke-width="4"/><path d="M280 80L350 180L325 235L410 300L370 415" stroke="#343a3e" stroke-width="17" fill="none"/><rect y="440" width="700" height="60" fill="white"/><text x="20" y="480" font-size="22">SYNTHETIC TEST - NOT A REAL REPORT</text></svg>',
    ),
  )
    .jpeg()
    .toBuffer();
  const uploadPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/reports/upload") &&
      r.request().method() === "POST",
  );
  await page
    .getByLabel("위험 사진 선택")
    .setInputFiles({ name: "synthetic.jpg", mimeType: "image/jpeg", buffer });
  const uploaded = await uploadPromise;
  if (uploaded.status() !== 201) throw Error("사진 업로드 실패");
  id = (await uploaded.json()).id;
  await page.getByRole("button", { name: "위치 확인으로" }).click();
  await page.getByLabel("장소 이름이나 주소로 찾기").fill("서울시청");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.locator(".sr-search-results button").first().click();
  await page
    .getByLabel("장소 설명")
    .fill("[합성 검증] 시청 앞 가상 보도");
  await page.getByRole("button", { name: "위치 확인 · 다음" }).click();
  await page
    .getByLabel("발견한 상황")
    .fill(
      "[합성 검증] 가상 보도블록에 큰 금이 생겨 걸을 때 넘어질 수 있습니다.",
    );
  await page.getByRole("button", { name: "확인하고 다음" }).click();
  await page
    .getByRole("checkbox", { name: /사진·위치·설명을 외부 AI/ })
    .check();
  const draftPromise = page.waitForResponse((r) => r.url().endsWith("/draft"), {
    timeout: 40000,
  });
  await page.getByRole("button", { name: "✧ AI로 신고문 작성하기" }).click();
  const response = await draftPromise;
  const result = await response.json();
  if (!response.ok()) throw Error(result.error);
  await page.waitForFunction(
    () => document.querySelector(".sr-draft input")?.value.length > 0,
  );
  const title = await page.getByLabel("제목", { exact: true }).inputValue();
  const content = await page
    .getByLabel("신고 내용", { exact: true })
    .inputValue();
  if (!title || !content) throw Error("신고문 표시 실패");
  await page.getByRole("button", { name: "제목과 내용 모두 복사" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes(title) || !copied.includes(content))
    throw Error("복사 결과 불일치");
  await page.screenshot({
    path: "evidence/simple-step4-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "evidence/simple-step4-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "위험 지도", exact: true }).click();
  await page.getByRole("heading", { name: "전국 위험 지도" }).waitFor();
  await page.locator(".sr-region-map .map").waitFor({ timeout: 25000 });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".leaflet-tile-loaded")).some(
      (x) => x.complete,
    ),
  );
  await page.screenshot({
    path: "evidence/simple-region-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "evidence/simple-region-mobile.png",
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("모바일 가로 넘침");
  if (errors.length) throw Error("브라우저 실행 오류");
  const evidence = {
    checkedAt: new Date().toISOString(),
    syntheticOnly: true,
    paidAiCalls: 1,
    aiDraftSuccess: true,
    titlePresent: !!title,
    contentPresent: !!content,
    copyMatches: true,
    newRisk: result.riskLevel,
    mapScope: "전국",
    realLocationSearch: true,
    nationwideMapImmediatelyVisible: true,
    browserErrors: errors,
  };
  await writeFile(
    "evidence/simple-check.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  if (id)
    await context.request
      .delete(baseURL + "/api/reports/" + id, { headers: { Origin: baseURL } })
      .catch(() => {});
  await browser.close();
}
