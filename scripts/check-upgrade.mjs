/** 합성 사진만 사용해 실제 AI 중복 판단·캐시·위험도·지도 표시를 검증합니다. 사용자 제보는 수정하지 않습니다. */
import { request, chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const baseURL = "http://127.0.0.1:3000";
const client = await request.newContext({
  baseURL,
  extraHTTPHeaders: { Origin: baseURL },
});
const ids = [];
let browser;
/** 요청 실패 시 공급자 원문이나 비밀값 대신 앱의 제한된 오류만 반환합니다. */
async function api(url, method = "GET", data) {
  const res = await client.fetch("/api/reports" + url, {
    method,
    data,
    timeout: 40000,
  });
  const value = await res.json();
  if (!res.ok()) throw Error(`앱 검증 실패 ${res.status()}: ${value.error}`);
  return value;
}
/** 개인정보 없는 보도 균열 또는 신호등 그림을 생성합니다. 실제 사고 사진이 아닙니다. */
async function image(kind, shift = 0) {
  const content =
    kind === "crack"
      ? `<rect width="800" height="600" fill="#acb1b5"/><path d="M0 150H800M0 300H800M0 450H800M160 0V600M320 0V600M480 0V600M640 0V600" stroke="#777d82" stroke-width="5"/><path transform="translate(${shift},0)" d="M340 120L390 240L350 300L440 370L405 490" stroke="#252b31" stroke-width="22" fill="none"/>`
      : `<rect width="800" height="600" fill="#dbe9ef"/><rect x="380" y="80" width="30" height="500" fill="#555"/><rect x="330" y="60" width="130" height="300" rx="20" fill="#222"/><circle cx="395" cy="125" r="32" fill="#393939"/><circle cx="395" cy="210" r="32" fill="#393939"/><circle cx="395" cy="295" r="32" fill="#393939"/>`;
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${content}<rect y="540" width="800" height="60" fill="white"/><text x="20" y="578" font-size="24" fill="#246">SYNTHETIC TEST - NOT A REAL REPORT</text></svg>`,
    ),
  )
    .jpeg()
    .toBuffer();
}
async function upload(kind, patch, shift = 0) {
  const res = await client.post("/api/reports/upload", {
    multipart: {
      image: {
        name: "synthetic.jpg",
        mimeType: "image/jpeg",
        buffer: await image(kind, shift),
      },
    },
  });
  if (res.status() !== 201) throw Error("검증 사진 업로드 실패");
  const r = await res.json();
  ids.push(r.id);
  await api("/" + r.id, "PATCH", {
    latitude: 37.5665123,
    longitude: 126.9780123,
    ...patch,
  });
  return r;
}
try {
  // 1. 같은 위치의 같은 위험과 다른 위험을 만들어 단순 위치 매칭의 오탐을 확인합니다.
  const same = await upload("crack", {
    title: "[검증] 가상 공원 입구 보도블록 균열",
    description: "[합성 검증] 가상 공원 동쪽 입구 보도블록이 갈라져 있습니다.",
    riskType: "보행 위험",
  });
  await api("/" + same.id + "/publish", "POST", {
    isPublic: true,
    photoPublic: true,
    photoConfirmed: true,
  });
  const other = await upload("light", {
    title: "[검증] 신호등 불빛 고장",
    description:
      "[합성 검증] 같은 입구 옆 횡단보도 신호등의 불빛이 꺼져 있습니다. 바닥 파손과는 다른 시설입니다.",
    riskType: "도로·교통",
  });
  await api("/" + other.id + "/publish", "POST", {
    isPublic: true,
    photoPublic: false,
    photoConfirmed: false,
  });
  const source = await upload(
    "crack",
    {
      title: "[검증] 산책로 바닥 파손",
      description:
        "[합성 검증] 가상 공원 동쪽 입구의 바닥 보도블록에 큰 금이 생겼습니다.",
      riskType: "보행 위험",
      latitude: 37.56655,
      longitude: 126.9789,
    },
    7,
  );
  // 2. 새 사진 분석의 위험도 포함, 기존 제보의 별도 위험도 API, AI 중복·재조회 캐시를 검증합니다. 실제 유료 요청 3회입니다.
  const analyzed = await api("/" + source.id + "/analyze", "POST", {
    consent: true,
  });
  if (!analyzed.riskAssessedAt) throw Error("새 분석에 위험도 시각 없음");
  const risk = await api("/" + same.id + "/risk", "POST", { consent: true });
  if (!risk.riskAssessedAt || !risk.riskReason)
    throw Error("기존 제보 위험도 저장 실패");
  const similar = await api("/" + source.id + "/similar", "POST", {
    useAI: true,
  });
  const sameResult = similar.candidates.find((x) => x.id === same.id),
    otherResult = similar.candidates.find((x) => x.id === other.id);
  if (!sameResult?.matched || otherResult?.matched)
    throw Error(
      "실제 AI가 같은 균열/다른 신호등을 구분하지 못했습니다: " +
        JSON.stringify({
          same: sameResult?.comparison,
          other: otherResult?.comparison,
        }),
    );
  const again = await api("/" + source.id + "/similar", "POST", {
    useAI: true,
  });
  if (!again.cached || again.result !== similar.result)
    throw Error("AI 중복 결과 재사용 실패");
  // 3. 공개 위험 지도를 데스크톱과 모바일에서 표시하고 근거·범례·필터를 확인합니다.
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(baseURL);
  await page.getByRole("button", { name: "위험 지도", exact: true }).click();
  await page.locator(".sr-region-map .map").waitFor();
  await page.getByRole("heading", { name: "전국 위험 지도" }).waitFor();
  await page.locator(".map-marker").first().waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".leaflet-tile-loaded")).some(
      (x) => x.complete,
    ),
  );
  await mkdir("evidence", { recursive: true });
  await page.screenshot({
    path: "evidence/risk-map-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "evidence/risk-map-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (errors.length || overflow) throw Error("위험 지도 화면 오류");
  const evidence = {
    checkedAt: new Date().toISOString(),
    syntheticOnly: true,
    paidRequests: 3,
    sourceRisk: analyzed.riskLevel,
    existingRisk: risk.riskLevel,
    riskReason: risk.riskReason,
    sameVerdict: sameResult.comparison.verdict,
    otherVerdict: otherResult.comparison.verdict,
    duplicateResult: similar.result,
    cachePreserved: again.cached,
    browserErrors: errors,
    horizontalOverflow: overflow,
  };
  await writeFile(
    "evidence/upgrade-check.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  for (const id of ids.reverse())
    await client.delete("/api/reports/" + id).catch(() => {});
  await browser?.close();
  await client.dispose();
}
