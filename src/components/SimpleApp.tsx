"use client";
/** 쉬운 신고 준비 화면. 사진→위치→상황·유사 제보→신고처·신고문의 네 단계와 전국 위험 지도를 제공합니다. */
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import LocationSearch from "./LocationSearch";
import RiskAssessment from "./RiskAssessment";
import WelcomeIllustration from "./WelcomeIllustration";
import { labels } from "@/lib/rules";
import ReportingRecommendations from "./ReportingRecommendations";
import { riskLabels } from "@/lib/risk";
const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => (
    <div className="sr-map-loading" role="status">
      지도를 불러오는 중입니다…
    </div>
  ),
});
type Report = {
  id: string;
  title: string;
  description: string;
  riskType: string;
  aiSummary?: string;
  draftText?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string;
  placeType?: string;
  status: string;
  isDraft?: boolean;
  isPublic?: boolean;
  photoPublic: boolean;
  isOwner: boolean;
  uploadedAt: string;
  expiresAt?: string;
  riskLevel?: string;
  riskReason?: string;
  riskAssessedAt?: string | null;
  comparison?: { verdict: string; reason: string; source: string };
  distanceBand?: string;
};
type Similar = {
  result: string;
  reason: string;
  candidates: Report[];
  aiUsed?: boolean;
  cached?: boolean;
};
const NATIONAL_BOUNDS: [[number, number], [number, number]] = [
  [32.7, 124.3],
  [38.9, 132.0],
];

type View = "home" | "write" | "map" | "mine" | "detail" | "help";
/** 앱 API를 호출하고 한국어 오류를 전달합니다. 민감한 값은 로그에 출력하지 않습니다. */
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const res = await fetch("/api/reports" + path, {
    method,
    headers:
      data instanceof FormData
        ? undefined
        : data
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
  });
  const value = await res.json();
  if (!res.ok)
    throw Error(value.error || "처리하지 못했습니다. 다시 눌러 주세요.");
  return value;
}
/** 유사 후보 확인을 불필요하게 반복하지 않도록 사용자가 바꿀 수 있는 관찰 입력만 비교합니다. */
function observationKey(r: Report, consent: boolean) {
  return JSON.stringify([
    r.id,
    r.description,
    r.latitude,
    r.longitude,
    r.locationLabel,
    consent,
  ]);
}
export default function SimpleApp() {
  const [view, setView] = useState<View>("home"),
    [step, setStep] = useState(1),
    [report, setReport] = useState<Report | null>(null),
    [rows, setRows] = useState<Report[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [aiConsent, setAiConsent] = useState(false),
    [similar, setSimilar] = useState<Similar | null>(null),
    [checked, setChecked] = useState(""),
    [share, setShare] = useState(false),
    [photo, setPhoto] = useState(false),
    [photoConfirmed, setPhotoConfirmed] = useState(false),
    [photoDialog, setPhotoDialog] = useState(false),
    [mapVersion, setMapVersion] = useState(0),
    [riskFilter, setRiskFilter] = useState("ALL"),
    [locating, setLocating] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const visible = rows.filter(
    (r) => riskFilter === "ALL" || (r.riskLevel || "UNKNOWN") === riskFilter,
  );
  const pick = useCallback(
    (latitude: number, longitude: number) =>
      setReport((old) =>
        old ? { ...old, latitude, longitude, riskAssessedAt: null } : old,
      ),
    [],
  );
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, step]);
  /** 실행 중 중복 전송을 막고 실패 시 입력을 유지합니다. */
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "처리하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function go(next: View) {
    setError("");
    setNotice("");
    setView(next);
    if (next === "mine" || next === "map")
      await run(async () =>
        setRows(await api<Report[]>("/" + (next === "mine" ? "mine" : "map"))),
      );
  }
  /** 서버 응답으로 공개 범위를 확인하고 기록을 다시 열 때 AI 전송 동의를 새로 받습니다. */
  async function open(id: string) {
    await run(async () => {
      const r = await api<Report>("/" + id);
      setReport(r);
      setShare(!!r.isPublic);
      setPhoto(r.photoPublic);
      setPhotoConfirmed(r.photoPublic);
      setAiConsent(false);
      setSimilar(null);
      setChecked("");
      setView("detail");
    });
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    if (id) void open(id); /* 상세 링크는 처음 열 때만 처리합니다. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 공개 지도와 내 목록을 다시 읽어 오래된 상태가 계속 남지 않게 합니다.
  useEffect(() => {
    if (view !== "map" && view !== "mine") return;
    let active = true;
    const timer = setInterval(() => {
      api<Report[]>("/" + (view === "map" ? "map" : "mine"))
        .then((items) => {
          if (active) setRows(items);
        })
        .catch(() => {});
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [view]);
  useEffect(() => {
    if (!report?.isOwner || !report.expiresAt || report.status !== "PREPARING")
      return;
    const remaining = Date.parse(report.expiresAt) - Date.now();
    const timer = setTimeout(
      () => {
        api<Report>("/" + report.id)
          .then((latest) =>
            setReport((old) =>
              old?.id === latest.id ? { ...old, status: latest.status } : old,
            ),
          )
          .catch(() => {});
      },
      Math.max(100, Math.min(remaining + 100, 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [report?.id, report?.status, report?.expiresAt, report?.isOwner]);
  function change(key: keyof Report, value: unknown) {
    setReport((old) =>
      old
        ? {
            ...old,
            [key]: value,
            // 새 설명을 입력하는 동안에도 예전 사진 관찰로 긴급성·신고처를 판단하지 않습니다.
            ...([
              "description",
              "locationLabel",
              "riskType",
              "placeType",
              "aiSummary",
            ].includes(key) && old[key] !== value
              ? { riskAssessedAt: null }
              : {}),
          }
        : old,
    );
  }
  /** 입력 필드만 저장하며 소유권과 공개 설정은 전용 API로 처리합니다. */
  async function save(current = report) {
    if (!current) throw Error("사진을 먼저 선택해 주세요.");
    const {
      title,
      description,
      riskType,
      aiSummary,
      draftText,
      latitude,
      longitude,
      locationLabel,
      placeType,
    } = current;
    const updated = await api<Report>("/" + current.id, "PATCH", {
      title,
      description,
      riskType,
      aiSummary,
      draftText,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      locationLabel,
      placeType,
    });
    setReport(updated);
    return updated;
  }
  async function upload(file?: File) {
    if (!file) return;
    await run(async () => {
      const form = new FormData();
      form.set("image", file);
      setReport(await api<Report>("/upload", "POST", form));
      setSimilar(null);
      setChecked("");
      setAiConsent(false);
      setShare(false);
      setPhoto(false);
      setPhotoConfirmed(false);
    });
  }
  function begin() {
    setReport(null);
    setStep(1);
    setSimilar(null);
    setChecked("");
    setAiConsent(false);
    setView("write");
    setError("");
    setNotice("");
  }
  function locate() {
    setLocating(true);
    setError("");
    if (!navigator.geolocation) {
      setError(
        "이 기기는 위치 찾기를 지원하지 않습니다. 장소 검색이나 지도를 이용해 주세요.",
      );
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        pick(position.coords.latitude, position.coords.longitude);
        setLocating(false);
        setNotice(
          "현재 위치를 확인했습니다. 사진을 찍은 장소가 맞는지 확인해 주세요.",
        );
      },
      () => {
        setLocating(false);
        setError(
          "현재 위치를 확인하지 못했습니다. 아래에서 장소를 검색하거나 지도를 눌러 주세요.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  /** 1. 관찰 입력을 저장합니다. 2. 동의가 있으면 위험 분류를 보조합니다. 3. 공개된 유사 후보만 비교합니다. */
  async function compare(force = false) {
    if (!report?.description.trim())
      throw Error("발견한 상황을 입력해 주세요.");
    if (!force && checked === observationKey(report, aiConsent) && similar)
      return similar;
    let current = await save();
    let warning = "";
    if (aiConsent) {
      try {
        current = await api<Report>("/" + current.id + "/inspect", "POST", {
          consent: true,
        });
        setReport(current);
      } catch (e) {
        warning = e instanceof Error ? e.message : "AI 확인에 실패했습니다.";
      }
    }
    const result = await api<Similar>("/" + current.id + "/similar", "POST", {
      useAI: aiConsent,
    });
    setSimilar(result);
    setChecked(observationKey(current, aiConsent));
    if (warning)
      setNotice(warning + " 입력한 내용으로 유사 제보를 확인했습니다.");
    return result;
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setNotice("복사했습니다. 공식 신고 사이트에 붙여 넣어 제출하세요.");
  }
  async function generate() {
    if (!aiConsent) throw Error("AI가 사진과 설명을 분석하도록 동의해 주세요.");
    const current = await save();
    const updated = await api<Report>("/" + current.id + "/draft", "POST", {
      consent: true,
    });
    setReport(updated);
    setNotice(
      "신고문 초안을 생성했습니다. 제출 전 내용을 확인하고 수정하세요.",
    );
  }
  async function store() {
    const current = await save();
    if (!current.title.trim() || !current.draftText?.trim())
      throw Error(
        "제목과 신고 내용을 작성해 주세요. AI로 생성하거나 직접 작성할 수 있습니다.",
      );
    const fresh = await api<Similar>("/" + current.id + "/similar", "POST", {
      useAI: aiConsent,
    });
    const signature = (items: Report[]) =>
      JSON.stringify(
        items.map((x) => [x.id, x.title, x.description, x.status]),
      );
    if (
      fresh.candidates.length &&
      signature(fresh.candidates) !== signature(similar?.candidates || [])
    ) {
      setSimilar(fresh);
      setNotice(
        "새로운 유사 제보가 있습니다. 아래 내용을 확인한 뒤 다시 보관해 주세요.",
      );
      return;
    }
    const saved = await api<Report>("/" + current.id + "/publish", "POST", {
      isPublic: share,
      photoPublic: photo,
      photoConfirmed,
    });
    setReport(saved);
    setView("detail");
    setNotice(
      "기록을 저장했습니다. 공식 신고는 추천 사이트에서 직접 진행해 주세요.",
    );
  }
  const consent = (
    <label className="sr-check">
      <input
        type="checkbox"
        checked={aiConsent}
        onChange={(e) => setAiConsent(e.target.checked)}
      />
      <span>
        사진·위치·설명을 외부 AI에 보내 분석하는 데 동의합니다.
        <small>
          동의하지 않아도 직접 작성하고 신고처를 확인할 수 있습니다.
        </small>
      </span>
    </label>
  );
  const privacy = (
    <details className="sr-options">
      <summary>지도 공개 범위 선택 (선택 사항)</summary>
      <p>
        기록을 저장할 때 적용됩니다. 사진과 설명의 얼굴·차량번호·개인 주소를
        먼저 확인해 주세요.
      </p>
      <label className="sr-check">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => {
            setShare(e.target.checked);
            if (!e.target.checked) {
              setPhoto(false);
              setPhotoConfirmed(false);
            }
          }}
        />
        <span>내용 요약·대략적인 위치·AI 위험도를 지도에 공개합니다.</span>
      </label>
      <label className="sr-check">
        <input
          type="checkbox"
          checked={photo}
          disabled={!share}
          onChange={(e) => {
            setPhoto(e.target.checked);
            setPhotoConfirmed(false);
            if (e.target.checked) setPhotoDialog(true);
          }}
        />
        <span>사진도 공개합니다. (추가 확인 필요)</span>
      </label>
      {photo && !photoConfirmed && (
        <button className="sr-secondary" onClick={() => setPhotoDialog(true)}>
          사진 공개 다시 확인
        </button>
      )}
    </details>
  );
  const candidates = similar && (
    <section className="sr-similar" aria-label="유사 제보 결과">
      <h3>{similar.result}</h3>
      <p>{similar.reason}</p>
      {similar.candidates.map((item) => (
        <article key={item.id}>
          <a
            href={"/?report=" + item.id}
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.title || "주변 제보"} ↗
          </a>
          <p>{item.comparison?.reason || item.description}</p>
          <small>
            {item.distanceBand} · {labels[item.status]}
          </small>
        </article>
      ))}
      <p className="sr-small">
        앱에 공개된 제보만 비교합니다. 유사한 제보가 있어도 직접 판단하고 계속
        진행할 수 있습니다.
      </p>
    </section>
  );
  const reportCard = (r: Report) => (
    <button className="sr-report-card" key={r.id} onClick={() => open(r.id)}>
      <span className={"risk-badge risk-" + (r.riskLevel || "UNKNOWN")}>
        {riskLabels[r.riskLevel || "UNKNOWN"]}
      </span>
      <strong>{r.title || "작성 중인 기록"}</strong>
      <span>{r.description || "사진이 등록된 비공개 초안입니다."}</span>
      <small>
        {r.isDraft ? "작성 중" : labels[r.status]} ·{" "}
        {new Date(r.uploadedAt).toLocaleDateString("ko-KR")}
      </small>
      <span className="sr-card-link">자세히 보기 →</span>
    </button>
  );
  return (
    <div className="simple-app">
      <a className="sr-skip" href="#content">
        본문으로 바로 가기
      </a>
      <header className="sr-header">
        <button
          className="sr-brand"
          aria-label="SafeReport 홈"
          onClick={() => go("home")}
        >
          <span aria-hidden="true">S</span>SafeReport
        </button>
        <nav aria-label="주요 메뉴">
          <button className={view === "write" ? "current" : ""} onClick={begin}>
            신고 준비
          </button>
          <button
            className={view === "map" ? "current" : ""}
            onClick={() => go("map")}
          >
            위험 지도
          </button>
          <button
            className={view === "mine" ? "current" : ""}
            onClick={() => go("mine")}
          >
            내 기록
          </button>
        </nav>
      </header>
      <main id="content" className="sr-main">
        <p className="sr-purpose">
          <span aria-hidden="true">ⓘ</span> SafeReport는 신고를 접수하지
          않습니다. 공식 신고처 안내와 신고문 작성을 지원합니다.
        </p>
        {error && (
          <div className="sr-alert sr-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="sr-alert" role="status">
            {notice}
          </div>
        )}
        {busy && (
          <div className="sr-busy" role="status">
            처리 중입니다. 잠시 기다려 주세요…
          </div>
        )}
        {view === "home" && (
          <>
            <div className="sr-home-hero">
              <section className="sr-welcome">
                <span className="sr-kicker">
                  발견에서 신고 준비까지, 한 번에
                </span>
                <h1 ref={heading} tabIndex={-1}>
                  사진 한 장으로,
                  <br />
                  신고 준비를 <em>한 번에.</em>
                </h1>
                <p>
                  사진과 위치를 바탕으로 유사 제보를 확인하고,
                  <br className="sr-desktop" /> 적절한 신고처와 신고문을 함께
                  준비합니다.
                </p>
                <button className="sr-primary sr-start" onClick={begin}>
                  사진 올리고 시작하기 <span aria-hidden="true">→</span>
                </button>
                <button className="sr-map-link" onClick={() => go("map")}>
                  전국 위험 지도 보기 <span aria-hidden="true">↗</span>
                </button>
              </section>
              <WelcomeIllustration />
            </div>
            <ol className="sr-overview">
              <li>
                <span>1</span>
                <div>
                  <strong>현장 정보 등록</strong>
                  <p>현장 사진과 위치를 등록합니다.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>유사 제보 확인</strong>
                  <p>기존 제보와 중복 여부를 확인합니다.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>신고처·신고문 준비</strong>
                  <p>초안을 복사해 공식 사이트에 제출합니다.</p>
                </div>
              </li>
            </ol>
          </>
        )}
        {view === "write" && (
          <>
            <div className="sr-write-head">
              <p className="sr-kicker">신고 준비 · {step} / 4</p>
              <ol className="sr-steps" aria-label="작성 단계">
                {["사진", "위치", "상황 확인", "신고문"].map((name, index) => (
                  <li
                    key={name}
                    aria-current={step === index + 1 ? "step" : undefined}
                    className={
                      step === index + 1
                        ? "current"
                        : step > index + 1
                          ? "done"
                          : ""
                    }
                  >
                    <span>{index + 1}</span>
                    {name}
                  </li>
                ))}
              </ol>
              <h1 ref={heading} tabIndex={-1}>
                {
                  [
                    "현장 사진 등록",
                    "발견 위치 확인",
                    "발견 상황 및 유사 제보 확인",
                    "신고처 확인 및 신고문 작성",
                  ][step - 1]
                }
              </h1>
            </div>
            <section className="sr-form-panel">
              {step === 1 && (
                <>
                  <p>위험 요소가 잘 드러나는 현장 사진을 등록하세요.</p>
                  {report ? (
                    <div className="sr-photo-preview">
                      <img
                        src={"/api/reports/" + report.id + "/image"}
                        alt="선택한 사진"
                      />
                      <p>선택한 사진을 확인한 후 다음 단계로 진행하세요.</p>
                    </div>
                  ) : (
                    <div className="sr-upload-symbol" aria-hidden="true">
                      <svg
                        width="66"
                        height="66"
                        viewBox="0 0 64 64"
                        fill="none"
                      >
                        <path
                          d="m21 20 5-7h12l5 7h10v31H11V20h10Z"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="32"
                          cy="34"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        />
                        <path
                          d="M47 25h1"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  )}
                  <label className="sr-upload-button">
                    {report ? "다른 사진 선택하기" : "사진 선택하기"}
                    <input
                      aria-label="위험 사진 선택"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy}
                      onChange={(e) => upload(e.target.files?.[0])}
                    />
                  </label>
                  <p className="sr-small">
                    휴대전화에서는 사진을 찍거나 저장된 사진을 선택할 수
                    있습니다.
                    <br />
                    JPG·PNG·WebP, 최대 10MB · 사진은 비공개 초안으로 저장됩니다.
                  </p>
                  <div className="sr-bottom-actions">
                    <button
                      className="sr-primary"
                      disabled={busy || !report}
                      onClick={() => setStep(2)}
                    >
                      위치 확인으로 →
                    </button>
                  </div>
                </>
              )}
              {step === 2 && report && (
                <>
                  <button
                    className="sr-primary sr-gps"
                    disabled={locating}
                    onClick={locate}
                  >
                    {locating
                      ? "현재 위치를 확인하는 중입니다…"
                      : "⌖ GPS로 현재 위치 찾기"}
                  </button>
                  <p>사진을 찍은 장소가 맞는지 지도를 확인해 주세요.</p>
                  <LocationSearch
                    onSelect={(result) => {
                      pick(result.latitude, result.longitude);
                      change("locationLabel", result.name);
                      setNotice(
                        "검색한 장소를 선택했습니다. 지도 핀으로 위치를 조정할 수 있습니다.",
                      );
                    }}
                  />
                  <div className="sr-location-note" role="status">
                    {report.latitude != null
                      ? "✓ 위치가 선택되었습니다. 지도 핀으로 세부 위치를 조정하세요."
                      : "아직 위치가 없습니다. GPS·검색·지도 중 하나로 선택해 주세요."}
                  </div>
                  <div className="sr-map">
                    <Map
                      lat={report.latitude}
                      lon={report.longitude}
                      onPick={pick}
                    />
                  </div>
                  <label className="sr-field">
                    장소 설명
                    <input
                      value={report.locationLabel || ""}
                      maxLength={200}
                      placeholder="예: 학교 정문 앞, 횡단보도 옆"
                      onChange={(e) => change("locationLabel", e.target.value)}
                    />
                  </label>
                  <details className="sr-options">
                    <summary>좌표로 직접 지정</summary>
                    <div className="sr-columns">
                      <label className="sr-field">
                        위도
                        <input
                          aria-label="위도"
                          type="number"
                          value={report.latitude ?? ""}
                          onChange={(e) =>
                            change(
                              "latitude",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      </label>
                      <label className="sr-field">
                        경도
                        <input
                          aria-label="경도"
                          type="number"
                          value={report.longitude ?? ""}
                          onChange={(e) =>
                            change(
                              "longitude",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      </label>
                    </div>
                  </details>
                  <div className="sr-bottom-actions">
                    <button className="sr-secondary" onClick={() => setStep(1)}>
                      ← 이전
                    </button>
                    <button
                      className="sr-primary"
                      disabled={
                        busy ||
                        report.latitude == null ||
                        report.longitude == null
                      }
                      onClick={() =>
                        run(async () => {
                          await save();
                          setStep(3);
                        })
                      }
                    >
                      위치 확인 · 다음 →
                    </button>
                  </div>
                </>
              )}
              {step === 3 && report && (
                <>
                  <ReportingRecommendations report={report} emergencyOnly />
                  <label className="sr-field">
                    발견한 상황
                    <textarea
                      value={report.description}
                      aria-label="발견한 상황"
                      maxLength={3000}
                      placeholder="예: 보도블록이 깨져서 걸을 때 넘어질 것 같아요."
                      onChange={(e) => change("description", e.target.value)}
                    />
                  </label>
                  <p>관찰한 내용과 예상되는 위험을 작성하세요.</p>
                  {consent}
                  <button
                    className="sr-secondary sr-wide"
                    disabled={busy || !report.description.trim()}
                    onClick={() =>
                      run(async () => {
                        await compare(true);
                      })
                    }
                  >
                    앱 내 유사 제보 확인
                  </button>
                  {candidates}
                  <div className="sr-bottom-actions">
                    <button className="sr-secondary" onClick={() => setStep(2)}>
                      ← 이전
                    </button>
                    <button
                      className="sr-primary"
                      disabled={busy || !report.description.trim()}
                      onClick={() =>
                        run(async () => {
                          await compare();
                          setStep(4);
                        })
                      }
                    >
                      확인하고 다음 →
                    </button>
                  </div>
                </>
              )}
              {step === 4 && report && (
                <>
                  <ReportingRecommendations report={report} />
                  <section className="sr-draft">
                    <h2>신고문 준비하기</h2>
                    <p>
                      AI가 제목과 신고문 초안을 작성합니다. 제출 전 내용을
                      확인하고 수정할 수 있습니다.
                    </p>
                    {consent}
                    <button
                      className="sr-primary sr-wide"
                      disabled={busy || !aiConsent}
                      onClick={() => run(generate)}
                    >
                      ✧ AI로 신고문 작성하기
                    </button>
                    <label className="sr-field">
                      제목
                      <input
                        value={report.title}
                        aria-label="제목"
                        maxLength={120}
                        placeholder="예: 보도블록 파손으로 인한 보행 위험"
                        onChange={(e) => change("title", e.target.value)}
                      />
                    </label>
                    <button
                      className="sr-copy"
                      disabled={!report.title}
                      onClick={() => run(() => copy(report.title))}
                    >
                      제목 복사
                    </button>
                    <label className="sr-field">
                      신고 내용
                      <textarea
                        className="sr-draft-text"
                        aria-label="신고 내용"
                        value={report.draftText || ""}
                        maxLength={6000}
                        placeholder="AI로 작성하거나 직접 적어 주세요."
                        onChange={(e) => change("draftText", e.target.value)}
                      />
                    </label>
                    <button
                      className="sr-copy"
                      disabled={!report.draftText}
                      onClick={() => run(() => copy(report.draftText || ""))}
                    >
                      신고 내용 복사
                    </button>
                    <button
                      className="sr-secondary sr-wide"
                      disabled={!report.title || !report.draftText}
                      onClick={() =>
                        run(() =>
                          copy(`${report.title}\n\n${report.draftText}`),
                        )
                      }
                    >
                      제목과 내용 모두 복사
                    </button>
                  </section>
                  <div className="sr-next-guide">
                    <strong>공식 신고 진행</strong>
                    <p>
                      추천 사이트를 열고, 복사한 내용을 붙여 넣어 직접 신고해
                      주세요.
                    </p>
                  </div>
                  <details className="sr-options">
                    <summary>유사 제보 다시 보기</summary>
                    {candidates || (
                      <p>이전 화면에서 유사 제보를 확인할 수 있습니다.</p>
                    )}
                  </details>
                  {privacy}
                  <button
                    className="sr-secondary sr-wide"
                    disabled={busy || (photo && !photoConfirmed)}
                    onClick={() => run(store)}
                  >
                    내 기록에 보관하기
                  </button>
                  <div className="sr-bottom-actions">
                    <button
                      className="sr-text-button"
                      onClick={() => setStep(3)}
                    >
                      ← 이전 화면
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
        {view === "map" && (
          <>
            <div className="sr-page-heading">
              <span className="sr-kicker">전국 안전 현황</span>
              <h1 ref={heading} tabIndex={-1}>
                전국 위험 지도
              </h1>
              <p>
                공개된 제보와 AI 추정 위험도를 전국 지도에서 확인하세요. 원하는
                지역으로 이동하거나 확대할 수 있습니다.
              </p>
            </div>
            <div className="sr-map-toolbar">
              <div className="sr-risk-filters" aria-label="위험도 필터">
                <button
                  className={riskFilter === "ALL" ? "selected" : ""}
                  onClick={() => setRiskFilter("ALL")}
                >
                  전체
                </button>
                {Object.entries(riskLabels).map(([key, name]) => (
                  <button
                    key={key}
                    className={
                      "risk-badge risk-" +
                      key +
                      (riskFilter === key ? " selected" : "")
                    }
                    onClick={() => setRiskFilter(key)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <button
                className="sr-secondary sr-national-reset"
                onClick={() => setMapVersion((v) => v + 1)}
              >
                전국 보기
              </button>
            </div>
            <div className="sr-map sr-region-map">
              <Map
                key={mapVersion}
                points={visible}
                riskMode
                bounds={NATIONAL_BOUNDS}
                preserveView
                onSelect={(id) => void open(id)}
              />
            </div>
            <div className="sr-national-caption">
              <span>
                공개 제보 <strong>{visible.length}건</strong>
              </span>
              <span>핀을 선택하면 제보별 내용을 확인할 수 있습니다.</span>
            </div>
            <p className="sr-map-caution">
              위험도는 AI 추정치이며 현장 확인이 필요합니다. 제보가 없거나
              위험도가 낮다고 해서 안전이 보장되지는 않습니다.
            </p>
            <div className="sr-records">{visible.map(reportCard)}</div>
            {!visible.length && (
              <div className="sr-empty">
                <h3>조건에 맞는 공개 제보가 없습니다</h3>
                <p>
                  다른 위험도 필터를 선택하거나 새 제보를 준비할 수 있습니다.
                </p>
              </div>
            )}
            <details className="sr-options">
              <summary>지도 표시 기준</summary>
              <p>
                핀 숫자는 주변 제보 수이며, 색상은 해당 그룹에서 평가된 가장
                높은 위험도입니다. 신고 완료는 작성자의 확인 표시이며 기관
                접수나 수리 완료를 뜻하지 않습니다.
              </p>
            </details>
          </>
        )}
        {view === "mine" && (
          <>
            <div className="sr-page-heading">
              <h1 ref={heading} tabIndex={-1}>
                내 기록
              </h1>
              <p>이 브라우저에서 준비한 신고 내용을 확인하고 관리합니다.</p>
            </div>
            <div className="sr-records">{rows.map(reportCard)}</div>
            {!rows.length && (
              <div className="sr-empty">
                <h2>아직 보관한 기록이 없습니다</h2>
                <button className="sr-primary" onClick={begin}>
                  사진 올리고 시작하기
                </button>
              </div>
            )}
            <p className="sr-small">
              쿠키를 삭제하거나 다른 기기를 사용하면 기존 기록을 수정할 수
              없습니다.
            </p>
          </>
        )}
        {view === "detail" && report && (
          <>
            <div className="sr-page-heading">
              <span className="sr-kicker">
                {report.isOwner ? "내가 준비한 내용" : "공개된 제보"}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {report.title || "작성 중인 기록"}
              </h1>
              <p>{report.description}</p>
            </div>
            <section className="sr-form-panel">
              {(report.isOwner || report.photoPublic) && (
                <img
                  className="sr-detail-photo"
                  src={"/api/reports/" + report.id + "/image"}
                  alt="제보 사진"
                />
              )}
              <RiskAssessment
                key={report.id}
                report={report}
                busy={busy}
                onAnalyze={
                  report.isOwner
                    ? () =>
                        void run(async () =>
                          setReport(
                            await api<Report>(
                              "/" + report.id + "/risk",
                              "POST",
                              { consent: true },
                            ),
                          ),
                        )
                    : undefined
                }
              />
              {report.latitude != null && (
                <Map points={[report]} onSelect={() => {}} />
              )}
              {report.isOwner && (
                <>
                  <h2>준비한 신고문</h2>
                  <pre className="sr-saved-draft">
                    {report.draftText || "아직 작성된 신고문이 없습니다."}
                  </pre>
                  <button
                    className="sr-primary sr-wide"
                    disabled={!report.draftText}
                    onClick={() =>
                      run(() => copy(`${report.title}\n\n${report.draftText}`))
                    }
                  >
                    신고문 복사
                  </button>
                  <ReportingRecommendations report={report} />
                  <button
                    className="sr-secondary sr-wide"
                    onClick={() => {
                      setStep(report.latitude == null ? 2 : 3);
                      setView("write");
                    }}
                  >
                    내용 이어 쓰기·수정
                  </button>
                  <details className="sr-options">
                    <summary>기록 상태와 공개 범위 관리</summary>
                    <p>
                      {labels[report.status]} · 공식 접수·수리 여부는 확인하지
                      않아요.
                    </p>
                    {!report.isDraft && (
                      <>
                        <button
                          className="sr-secondary sr-wide"
                          disabled={busy}
                          onClick={() =>
                            run(async () =>
                              setReport(
                                await api<Report>(
                                  "/" + report.id + "/status",
                                  "PATCH",
                                  {
                                    reported: report.status !== "USER_REPORTED",
                                  },
                                ),
                              ),
                            )
                          }
                        >
                          {report.status === "USER_REPORTED"
                            ? "완료 표시 취소"
                            : "신고처에서 직접 신고했습니다"}
                        </button>
                        {privacy}
                        <button
                          className="sr-secondary sr-wide"
                          disabled={busy || (photo && !photoConfirmed)}
                          onClick={() =>
                            run(async () => {
                              setReport(
                                await api<Report>(
                                  "/" + report.id + "/visibility",
                                  "PATCH",
                                  {
                                    isPublic: share,
                                    photoPublic: photo,
                                    photoConfirmed,
                                  },
                                ),
                              );
                              setNotice("공개 범위를 변경했습니다.");
                            })
                          }
                        >
                          공개 범위 저장
                        </button>
                      </>
                    )}
                    <button
                      className="sr-delete"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "이 사진과 기록을 삭제할까요? 되돌릴 수 없습니다.",
                          )
                        )
                          void run(async () => {
                            await api("/" + report.id, "DELETE");
                            setReport(null);
                            await go("mine");
                          });
                      }}
                    >
                      이 기록 삭제
                    </button>
                  </details>
                </>
              )}
            </section>
          </>
        )}
        {view === "help" && (
          <>
            <div className="sr-page-heading">
              <h1 ref={heading} tabIndex={-1}>
                처음 이용하시나요?
              </h1>
            </div>
            <section className="sr-form-panel">
              <h2>신고는 어디에서 하나요?</h2>
              <p>
                SafeReport는 사진과 상황을 바탕으로 신고할 사이트와 신고문을
                준비합니다. 실제 신고는 추천된 공식 사이트에서 직접 진행해야
                합니다.
              </p>
              <h2>사진은 모두 공개되나요?</h2>
              <p>
                기본 설정은 비공개입니다. ‘내 기록에 보관하기’에서 내용 공개를
                선택할 수 있고, 사진은 추가 확인 후에만 공개됩니다.
              </p>
              <h2>AI가 알려준 내용은 정확한가요?</h2>
              <p>
                틀릴 수 있습니다. 신고문과 비슷한 제보는 직접 확인해 주세요.
                지도 위험도도 현장 확인이 필요한 추정치입니다.
              </p>
              <h2>위급한 상황인가요?</h2>
              <p>
                앱 작성을 기다리지 말고 해당 지역의 긴급 신고 체계를 먼저 이용해
                주세요.
              </p>
            </section>
          </>
        )}
      </main>
      <footer className="sr-footer">
        <strong>SafeReport</strong>
        <span>발견한 위험을 올바른 신고로 연결합니다.</span>
        <button onClick={() => go("help")}>이용 안내</button>
      </footer>
      {photoDialog && report && (
        <div className="sr-dialog-backdrop">
          <section
            className="sr-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-title"
          >
            <h2 id="photo-title">이 사진을 공개할까요?</h2>
            <img
              src={"/api/reports/" + report.id + "/image"}
              alt="공개 전 사진 확인"
            />
            <p>
              얼굴·차량번호·개인 주소가 없는지 다시 확인해 주세요. 다른 사용자가
              사진을 볼 수 있습니다.
            </p>
            <button
              className="sr-primary sr-wide"
              onClick={() => {
                setPhotoConfirmed(true);
                setPhotoDialog(false);
              }}
            >
              사진 공개에 동의합니다
            </button>
            <button
              className="sr-secondary sr-wide"
              onClick={() => {
                setPhoto(false);
                setPhotoConfirmed(false);
                setPhotoDialog(false);
              }}
            >
              비공개 유지
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
