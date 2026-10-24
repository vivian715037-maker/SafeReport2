/** 합성 사진으로 실제 로컬 API·OpenRouter·지도 화면을 검증합니다. 만든 제보는 마지막에 삭제합니다. */
import { chromium, request } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const baseURL = "http://127.0.0.1:3000";
const client = await request.newContext({
  baseURL,
  extraHTTPHeaders: { Origin: baseURL },
});
const svg = `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="600" fill="#a3a7aa"/><path d="M0 100H800M0 240H800M0 380H800M0 520H800M120 0V600M300 0V600M480 0V600M660 0V600" stroke="#727779" stroke-width="5"/><path d="M310 180L380 260L350 310L435 355L399 450" fill="none" stroke="#30363c" stroke-width="20"/><path d="M385 262L450 230M352 311L300 350" stroke="#30363c" stroke-width="10"/><rect x="0" y="530" width="800" height="70" fill="#e9eff6"/><text x="25" y="573" font-size="26" fill="#24446b">SYNTHETIC TEST IMAGE - NOT A REAL REPORT</text></svg>`;
let id;
let browser;
await mkdir("evidence", { recursive: true });
try {
  // 1. 개인 정보가 없는 합성 보도블록 사진을 업로드합니다.
  const upload = await client.post("/api/reports/upload", {
    multipart: {
      image: {
        name: "synthetic.jpg",
        mimeType: "image/jpeg",
        buffer: await sharp(Buffer.from(svg)).jpeg().toBuffer(),
      },
    },
  });
  if (upload.status() !== 201)
    throw Error(`업로드 실패 ${upload.status()} ${await upload.text()}`);
  id = (await upload.json()).id;
  await client.patch(`/api/reports/${id}`, {
    data: {
      latitude: 37.5665123,
      longitude: 126.9780123,
      locationLabel: "[테스트] 가상 보도",
      description: "[테스트] 합성 그림 속 보도블록 균열을 분석해 주세요.",
    },
  });
  // 2. 실제 모델 1회 호출을 확인합니다. 키는 실행 중인 서버 환경에서만 읽습니다.
  const analyzed = await client.post(`/api/reports/${id}/analyze`, {
    data: { consent: true },
    timeout: 40000,
  });
  const result = await analyzed.json();
  if (!analyzed.ok()) throw Error(`AI 검증 실패: ${JSON.stringify(result)}`);
  if (!result.title || !result.draftText)
    throw Error("AI 제목 또는 신고문 없음");
  await client.post(`/api/reports/${id}/publish`, {
    data: { isPublic: true, photoPublic: false, photoConfirmed: false },
  });
  // 3. 실제 지도 타일 응답과 데스크톱 화면을 확인합니다.
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let tiles = 0;
  page.on("response", (res) => {
    if (res.url().includes("tile.openstreetmap.org") && res.status() === 200)
      tiles++;
  });
  await page.goto(baseURL);
  await page.screenshot({ path: "evidence/home-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "위험 지도", exact: true }).click();
  await page.locator(".sr-region-map .map").waitFor();
  await page.locator(".map-marker").first().waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".leaflet-tile-loaded")).some(
      (x) => x.complete,
    ),
  );
  await page.screenshot({ path: "evidence/map-desktop.png", fullPage: true });
  if (errors.length) throw Error("브라우저 오류: " + errors.join(";"));
  await writeFile(
    "evidence/live-check.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
        aiSuccess: true,
        title: result.title,
        riskType: result.riskType,
        draftPresent: !!result.draftText,
        mapTile200: tiles,
        browserErrors: errors,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      aiSuccess: true,
      riskType: result.riskType,
      draftPresent: true,
      mapTile200: tiles,
      browserErrors: errors,
    }),
  );
} finally {
  if (id) await client.delete(`/api/reports/${id}`);
  await browser?.close();
  await client.dispose();
}
