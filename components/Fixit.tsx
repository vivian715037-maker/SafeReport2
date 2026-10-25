"use client";
/** 앱의 화면 전환과 API 호출을 연결합니다. 사진→위치→분석→공개 동의→신고 기록을 사용자가 확인하며 진행합니다. */
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { labels, office } from "@/lib/rules";
import { riskLabels } from "@/lib/risk";
import RiskAssessment from "./RiskAssessment";
const Map = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="map placeholder">지도를 불러오는 중…</div>,
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
  history?: {
    id: string;
    toStatus: string;
    changedAt: string;
    changeSource: string;
  }[];
};
type Similar = {
  result: string;
  reason: string;
  candidates: Report[];
  aiUsed?: boolean;
  cached?: boolean;
};
type View = "home" | "write" | "mine" | "map" | "guide" | "detail";
/** JSON API를 호출하고 서버의 한국어 오류를 화면에 전달합니다. 파일 업로드는 multipart 형식을 유지합니다. */
async function request<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const res = await fetch("/api/reports" + url, {
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
  const result = await res.json() as T & {error?:string};
  if (!res.ok) throw new Error(result.error || "요청에 실패했습니다.");
  return result;
}
/** 주요 화면과 입력 상태를 관리합니다. 공개 응답에 없는 비공개 필드는 화면에서도 가정하지 않습니다. */
export default function Fixit() {
  const [view, setView] = useState<View>("home"),
    [rows, setRows] = useState<Report[]>([]),
    [r, setR] = useState<Report | null>(null),
    [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [similar, setSimilar] = useState<Similar | null>(null),
    [aiConsent, setAiConsent] = useState(false),
    [share, setShare] = useState(false),
    [photo, setPhoto] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [confirmOpen, setConfirmOpen] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [mapMode, setMapMode] = useState<"reports" | "risk">("reports"),
    [riskFilter, setRiskFilter] = useState("ALL"),
    [now, setNow] = useState(Date.now());
  const pick = useCallback(
    (latitude: number, longitude: number) =>
      setR((old) => (old ? { ...old, latitude, longitude } : old)),
    [],
  );
  /** 비동기 작업 중 중복 클릭을 막고 실패 시 현재 입력을 유지합니다. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "문제가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function navigate(next: View) {
    setError("");
    setNotice("");
    setView(next);
    if (next === "mine" || next === "map")
      await run(async () => setRows(await request<Report[]>("/" + next)));
  }
  async function open(id: string) {
    await run(async () => {
      const item = await request<Report>("/" + id);
      setR(item);
      setShare(!!item.isPublic);
      setPhoto(item.photoPublic);
      setConfirmed(item.photoPublic);
      setAiConsent(false);
      setSimilar(null);
      setView("detail");
    });
  }
  useEffect(() => {
    if ((view !== "write" && view !== "detail") || r?.status !== "PREPARING")
      return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [view, r?.id, r?.status]);
  useEffect(() => {
    if (
      r?.isOwner &&
      r.expiresAt &&
      now >= Date.parse(r.expiresAt) &&
      r.status === "PREPARING"
    ) {
      request<Report>("/" + r.id)
        .then((latest) =>
          setR((current) =>
            current?.id === latest.id
              ? { ...current, status: latest.status }
              : current,
          ),
        )
        .catch(() => {});
    }
  }, [now, r]);
  // 목록·지도도 열린 동안 서버 상태를 다시 읽어 만료 표시가 오래 남지 않게 합니다.
  useEffect(() => {
    if (view !== "mine" && view !== "map") return;
    let active = true;
    const timer = setInterval(() => {
      request<Report[]>("/" + view)
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
  /** 화면의 편집 가능 필드만 서버에 저장합니다. 소유권과 공개 필드는 별도 API로만 변경합니다. */
  async function save() {
    if (!r) throw Error("사진을 먼저 올려 주세요.");
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
    } = r;
    const updated = await request<Report>("/" + r.id, "PATCH", {
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
    setR(updated);
    return updated;
  }
  function change(key: keyof Report, value: unknown) {
    setR((old) => (old ? { ...old, [key]: value } : old));
  }
  async function upload(file?: File) {
    if (!file) return;
    await run(async () => {
      const form = new FormData();
      form.set("image", file);
      setR(await request<Report>("/upload", "POST", form));
      setStep(2);
      setSimilar(null);
      setAiConsent(false);
      setShare(false);
      setPhoto(false);
      setConfirmed(false);
    });
  }
  function manualDraft() {
    if (!r) return;
    const draft = `제목: ${r.title || "시설 안전 점검 요청"}\n위치: ${r.locationLabel || `${r.latitude}, ${r.longitude}`}\n발견 상황: ${r.description}\n위험 설명: ${r.aiSummary || r.description}\n요청 사항: 현장 확인 후 필요한 안전 조치를 부탁드립니다.`;
    change("draftText", draft);
    setNotice(
      "입력 내용을 바탕으로 기본 양식을 만들었습니다. AI 생성 문구가 아닙니다.",
    );
  }
  async function checkSimilar(useAI: boolean) {
    await save();
    const result = await request<Similar>("/" + r!.id + "/similar", "POST", {
      useAI,
    });
    setSimilar(result);
    return result;
  }
  const currentOffice = office(r?.placeType || "공공시설");
  const visibleRows = rows.filter(
    (x) =>
      (filter === "ALL" || x.status === filter) &&
      (view !== "map" ||
        mapMode !== "risk" ||
        riskFilter === "ALL" ||
        (x.riskLevel || "UNKNOWN") === riskFilter),
  );
  const remaining = r?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(r.expiresAt) - now) / 1000))
    : 0;
  const card = (item: Report) => (
    <button className="report-card" key={item.id} onClick={() => open(item.id)}>
      <div className="card-icon">⌖</div>
      <div>
        <span className="eyebrow">
          {item.riskType} ·{" "}
          {new Date(item.uploadedAt).toLocaleDateString("ko-KR")}
        </span>
        <h3>{item.title || "작성 중인 제보"}</h3>
        <p>{item.description || "사진을 올린 비공개 초안입니다."}</p>
        <span className={"badge " + item.status}>{labels[item.status]}</span>
        {item.isDraft && <span className="badge">비공개 초안</span>}
        {view === "map" && mapMode === "risk" && (
          <span className={"risk-badge risk-" + (item.riskLevel || "UNKNOWN")}>
            AI 추정 {riskLabels[item.riskLevel || "UNKNOWN"]}
          </span>
        )}
        {view === "map" && mapMode === "risk" && (
          <p className="risk-card-reason">
            {item.riskReason || "아직 AI 위험도 평가가 없습니다."}
            {item.riskAssessedAt && (
              <small>
                {" "}
                · {new Date(item.riskAssessedAt).toLocaleString("ko-KR")}
              </small>
            )}
          </p>
        )}
      </div>
      <span className="arrow">↗</span>
    </button>
  );
  const similarity = similar && (
    <section className="panel similar">
      <span className="eyebrow">우리 앱의 공개 제보만 비교합니다</span>
      <h3>{similar.result}</h3>
      <p>{similar.reason}</p>
      {similar.candidates.map((item) => (
        <div className="candidate" key={item.id}>
          <a
            href={"/?report=" + item.id}
            onClick={(e) => {
              e.preventDefault();
              window.open(
                "/?report=" + item.id,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            {item.title} ↗
          </a>
          <span>
            {item.riskType} · {labels[item.status]} ·{" "}
            {new Date(item.uploadedAt).toLocaleString("ko-KR")}
          </span>
          <p className="comparison-reason">
            {item.distanceBand} ·{" "}
            {item.comparison?.verdict === "SAME"
              ? "같은 위험으로 추정"
              : item.comparison?.verdict === "POSSIBLE"
                ? "중복 가능성"
                : item.comparison?.verdict === "DIFFERENT"
                  ? "다른 위험으로 추정"
                  : "추가 확인 필요"}
            <br />
            {item.comparison?.reason}
            <small>
              판단 근거:{" "}
              {item.comparison?.source === "AI"
                ? "AI 비교"
                : item.comparison?.source === "TEXT"
                  ? "문구 유사도"
                  : item.comparison?.source === "PHOTO"
                    ? "동일 공개 사진"
                    : "거리·유형 후보"}
            </small>
          </p>
          <small>
            공개 지도에서 위치를 확인하세요. 중복 여부는 직접 판단할 수
            있습니다.
          </small>
        </div>
      ))}
    </section>
  );
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    if (id) void open(id); /* 최초 링크 진입만 처리합니다. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const privacy = (
    <div className="consent-box">
      <label className="check">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => {
            setShare(e.target.checked);
            if (!e.target.checked) {
              setPhoto(false);
              setConfirmed(false);
            }
          }}
        />
        편집한 제목·설명·위험 유형·상태·AI 위험도와 판단 이유·약 50m 단위 위치를
        공개합니다.
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={photo}
          disabled={!share}
          onChange={(e) => {
            setPhoto(e.target.checked);
            setConfirmed(false);
            if (e.target.checked) setConfirmOpen(true);
          }}
        />
        사진도 공개합니다 (추가 확인 필요).
      </label>
      <p>
        얼굴·차량번호·주소가 있는 사진이나 설명은 공개하지 마세요. 좌표를
        조정해도 장소를 알아볼 수 있으며 자동 가림 기능은 없습니다.
      </p>
      {photo && !confirmed && (
        <button className="secondary" onClick={() => setConfirmOpen(true)}>
          사진 공개 추가 확인
        </button>
      )}
    </div>
  );
  return (
    <div>
      <header className="header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            void navigate("home");
          }}
        >
          <span className="brand-mark">
            S<span>•</span>
          </span>
          SafeReport<span className="brand-tag">생활안전 제보</span>
        </a>
        <nav aria-label="주요 메뉴">
          {(
            [
              ["map", "제보 지도"],
              ["mine", "내 제보"],
              ["guide", "이용 안내"],
            ] as [View, string][]
          ).map(([key, name]) => (
            <button
              key={key}
              className={
                view === key && (key !== "map" || mapMode === "reports")
                  ? "active"
                  : ""
              }
              onClick={() => {
                if (key === "map") setMapMode("reports");
                void navigate(key);
              }}
            >
              {name}
            </button>
          ))}
          <button
            className={view === "map" && mapMode === "risk" ? "active" : ""}
            onClick={() => {
              setMapMode("risk");
              void navigate("map");
            }}
          >
            AI 위험 지도
          </button>
          <button
            className="primary nav-cta"
            onClick={() => {
              setR(null);
              setStep(1);
              void navigate("write");
            }}
          >
            + 위험 제보하기
          </button>
        </nav>
      </header>
      <main>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert" role="status">
            {notice}
          </div>
        )}
        {busy && (
          <div className="busy" role="status">
            처리 중입니다… 잠시 기다려 주세요.
          </div>
        )}
        {view === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="pill">
                  <span /> 우리 동네를 더 안전하게
                </div>
                <h1>
                  작은 발견이,
                  <br />
                  안전한 동네를
                  <br />
                  <em>만듭니다.</em>
                </h1>
                <p>
                  지나치기 쉬운 생활 속 위험,
                  <br />
                  사진 한 장으로 신고 준비를 시작하세요.
                </p>
                <div className="hero-actions">
                  <button
                    className="primary large"
                    onClick={() => {
                      setR(null);
                      setStep(1);
                      void navigate("write");
                    }}
                  >
                    위험 제보 시작하기 <span>↗</span>
                  </button>
                  <button
                    className="text-button"
                    onClick={() => navigate("map")}
                  >
                    우리 동네 제보 보기 →
                  </button>
                </div>
                <div className="hero-foot">
                  <span>✓ AI 신고문 작성</span>
                  <span>✓ 유사 제보 확인</span>
                  <span>✓ 공식 신고처 안내</span>
                </div>
              </div>
              <div
                className="hero-art"
                aria-label="동네 안전 제보를 표현한 일러스트"
              >
                <div className="art-grid" />
                <div className="street s1" />
                <div className="street s2" />
                <div className="building b1">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="building b2">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="building b3">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="park">♧</div>
                <div className="location-pin">!</div>
                <div className="floating-card">
                  <span className="tiny-icon">✓</span>
                  <div>
                    <b>더 안전한 일상을 향해</b>
                    <small>당신의 발견이 변화의 시작</small>
                  </div>
                  <span className="spark">✧</span>
                </div>
                <span className="art-label">
                  A SAFER NEIGHBORHOOD, TOGETHER
                </span>
              </div>
            </section>
            <section className="how">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">HOW IT WORKS</span>
                  <h2>발견부터 신고 준비까지, 간편하게</h2>
                </div>
                <p>복잡한 절차는 줄이고, 필요한 도움을 모았어요.</p>
              </div>
              <div className="features">
                {[
                  [
                    "01",
                    "▧",
                    "사진으로 남기기",
                    "위험한 시설을 발견했다면 사진을 올리고 위치를 확인해 주세요.",
                  ],
                  [
                    "02",
                    "✧",
                    "AI와 함께 확인하기",
                    "위험 요소와 비슷한 제보를 확인하고 신고문을 준비해요.",
                  ],
                  [
                    "03",
                    "↗",
                    "공식 신고처에 전달하기",
                    "직접 신고한 뒤 앱에 상태를 남겨 함께 확인해요.",
                  ],
                ].map(([num, icon, title, desc]) => (
                  <article key={num}>
                    <div className="feature-top">
                      <span>{icon}</span>
                      <small>{num}</small>
                    </div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </article>
                ))}
              </div>
            </section>
            <aside className="home-note">
              <span>ⓘ</span>
              <p>
                SafeReport은 <b>신고 준비를 돕는 서비스</b>입니다. 공식 신고는 안내된
                기관에서 직접 진행해 주세요.
              </p>
              <button onClick={() => navigate("guide")}>자세히 보기 →</button>
            </aside>
          </>
        )}
        {view === "write" && (
          <>
            <div className="page-title">
              <span className="eyebrow">REPORT A SAFETY ISSUE</span>
              <h1>작은 위험을 알려주세요</h1>
              <p>확인되지 않은 내용은 작성하지 않아도 괜찮아요.</p>
            </div>
            <div className="steps">
              {["사진 등록", "위치 확인", "분석·유사 제보", "신고 준비"].map(
                (x, i) => (
                  <span
                    key={x}
                    className={
                      step === i + 1 ? "selected" : step > i + 1 ? "done" : ""
                    }
                  >
                    <b>{i + 1}</b>
                    {x}
                  </span>
                ),
              )}
            </div>
            <div className="workspace">
              <section className="panel editor">
                {step === 1 && (
                  <>
                    <h2>어떤 위험을 발견하셨나요?</h2>
                    <p>
                      사진은 비공개로 저장돼요. 공개 여부는 마지막에 선택합니다.
                    </p>
                    <label className="upload">
                      <span>＋</span>
                      <b>사진을 선택하거나 촬영하세요</b>
                      <small>JPEG, PNG, WebP · 최대 10MB · 1장</small>
                      <input
                        aria-label="위험 사진 업로드"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy}
                        onChange={(e) => upload(e.target.files?.[0])}
                      />
                    </label>
                    <p className="muted">
                      사진 등록 시 현재 브라우저의 비공개 초안으로 저장됩니다.
                      10분 후 미완료로 표시되며 나중에 이어 쓸 수 있어요.
                    </p>
                  </>
                )}
                {r && step === 2 && (
                  <>
                    <h2>위치를 확인해 주세요</h2>
                    <p>
                      브라우저 위치는 사진 속 장소와 다를 수 있어요. 핀을 직접
                      옮겨 주세요.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        if (!navigator.geolocation) {
                          setError(
                            "위치를 지원하지 않습니다. 지도에서 선택하세요.",
                          );
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          (p) => pick(p.coords.latitude, p.coords.longitude),
                          () =>
                            setError(
                              "위치 권한이 없거나 위치를 찾지 못했습니다. 지도 또는 좌표를 직접 선택하세요.",
                            ),
                          { timeout: 10000 },
                        );
                      }}
                    >
                      ⌖ 현재 위치 사용 (권한 요청)
                    </button>
                    <Map lat={r.latitude} lon={r.longitude} onPick={pick} />
                    <div className="two-fields">
                      <label>
                        위도
                        <input
                          type="number"
                          aria-label="위도"
                          value={r.latitude ?? ""}
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
                      <label>
                        경도
                        <input
                          type="number"
                          aria-label="경도"
                          value={r.longitude ?? ""}
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
                    <label>
                      장소 설명
                      <input
                        value={r.locationLabel || ""}
                        placeholder="예: 학교 정문 앞 횡단보도 옆"
                        onChange={(e) =>
                          change("locationLabel", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      시설 유형
                      <select
                        value={r.placeType}
                        onChange={(e) => change("placeType", e.target.value)}
                      >
                        <option>공공시설</option>
                        <option>학교</option>
                        <option>사유시설</option>
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          if (r.latitude == null || r.longitude == null)
                            throw Error("위치를 선택해 주세요.");
                          await save();
                          setStep(3);
                        })
                      }
                    >
                      위치 저장 후 다음 →
                    </button>
                  </>
                )}
                {r && step === 3 && (
                  <>
                    <h2>위험 내용을 함께 확인해요</h2>
                    <label>
                      발견한 상황
                      <textarea
                        value={r.description}
                        placeholder="어디가 어떻게 위험한지 적어 주세요."
                        onChange={(e) => change("description", e.target.value)}
                      />
                    </label>
                    <div className="consent-box">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={aiConsent}
                          onChange={(e) => setAiConsent(e.target.checked)}
                        />
                        사진과 설명을 OpenRouter 및 모델 제공자에게 보내 AI
                        분석에 사용합니다.
                      </label>
                      <small>
                        동의하지 않아도 아래 내용을 직접 입력해 계속할 수
                        있어요.
                      </small>
                    </div>
                    <button
                      className="primary"
                      disabled={busy || !aiConsent}
                      onClick={() =>
                        run(async () => {
                          await save();
                          const updated = await request<Report>(
                            "/" + r.id + "/analyze",
                            "POST",
                            { consent: true },
                          );
                          setR(updated);
                          setNotice(
                            "AI 분석을 완료했습니다. 사실과 다른 부분을 수정해 주세요.",
                          );
                        })
                      }
                    >
                      ✧ AI로 사진 분석·신고문 작성
                    </button>
                    <label>
                      제보 제목
                      <input
                        value={r.title}
                        onChange={(e) => change("title", e.target.value)}
                      />
                    </label>
                    <label>
                      위험 유형
                      <select
                        value={r.riskType}
                        onChange={(e) => change("riskType", e.target.value)}
                      >
                        {[
                          "보행 위험",
                          "도로·교통",
                          "시설 파손",
                          "전기·화재",
                          "기타",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      위험 요소 요약
                      <textarea
                        value={r.aiSummary || ""}
                        onChange={(e) => change("aiSummary", e.target.value)}
                      />
                    </label>
                    <RiskAssessment report={r} />
                    <div className="actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await checkSimilar(aiConsent);
                          })
                        }
                      >
                        앱 내 유사 제보 확인
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await checkSimilar(aiConsent);
                            setStep(4);
                          })
                        }
                      >
                        저장 후 신고 준비 →
                      </button>
                    </div>
                    {similarity}
                  </>
                )}
                {r && step === 4 && (
                  <>
                    <h2>신고 내용을 확인해 주세요</h2>
                    {similarity}
                    <div className="office">
                      <span className="eyebrow">추천 신고처</span>
                      <h3>{currentOffice.name}</h3>
                      <p>{currentOffice.help}</p>
                      {currentOffice.url && (
                        <a
                          href={currentOffice.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          공식 신고 사이트 열기 ↗
                        </a>
                      )}
                    </div>
                    <label>
                      신고문 초안
                      <textarea
                        className="draft"
                        value={r.draftText || ""}
                        onChange={(e) => change("draftText", e.target.value)}
                      />
                    </label>
                    <div className="actions">
                      <button className="secondary" onClick={manualDraft}>
                        입력 내용으로 기본 양식 만들기
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            await navigator.clipboard.writeText(
                              r.draftText || "",
                            );
                            setNotice("신고문을 복사했습니다.");
                          })
                        }
                      >
                        신고문 복사
                      </button>
                    </div>
                    <h3>제보 공개 범위</h3>
                    {privacy}
                    <button
                      className="primary wide"
                      disabled={busy || (photo && !confirmed)}
                      onClick={() =>
                        run(async () => {
                          const saved = await save();
                          const fresh = await checkSimilar(aiConsent);
                          // 새로 등록되거나 변경된 후보는 먼저 보여 주고 다음 클릭에서 진행합니다.
                          const signature = (items: Report[]) =>
                            JSON.stringify(
                              items.map((x) => [x.id, x.title, x.status]),
                            );
                          if (
                            fresh.candidates.length &&
                            signature(fresh.candidates) !==
                              signature(similar?.candidates || [])
                          ) {
                            setNotice(
                              "새 유사 후보가 있습니다. 내용을 확인한 뒤 신고 진행을 다시 눌러 주세요.",
                            );
                            return;
                          }
                          const item = await request<Report>(
                            "/" + saved.id + "/publish",
                            "POST",
                            {
                              isPublic: share,
                              photoPublic: photo,
                              photoConfirmed: confirmed,
                            },
                          );
                          setR(item);
                          setView("detail");
                          setNotice(
                            "신고 준비 기록을 저장했습니다. 외부 신고처에 직접 제출해 주세요.",
                          );
                        })
                      }
                    >
                      신고 진행 · 기록 저장 →
                    </button>
                    <p className="muted">
                      게시 직전 유사 후보를 다시 확인합니다. 중복 가능성이
                      있어도 진행할 수 있습니다.
                    </p>
                  </>
                )}
              </section>
              <aside className="sidebar panel">
                {r ? (
                  <>
                    <img
                      className="preview"
                      src={"/api/reports/" + r.id + "/image"}
                      alt="등록한 위험 사진"
                    />
                    <span className={"badge " + r.status}>
                      {labels[r.status]}
                    </span>
                    <h3>한 번 더 확인해 주세요</h3>
                    <p>
                      실제 장소와 사진이 맞나요?
                      <br />
                      사진에 개인정보가 있지는 않나요?
                    </p>
                    <p className="timer">
                      {remaining > 0
                        ? `미완료 전환까지 ${Math.floor(remaining / 60)}분 ${remaining % 60}초`
                        : "10분 경과 · 나중에도 완료 표시 가능"}
                    </p>
                    <button
                      className="text-button"
                      onClick={() =>
                        run(async () => {
                          await request("/" + r.id, "DELETE");
                          setR(null);
                          setStep(1);
                        })
                      }
                    >
                      사진·초안 삭제
                    </button>
                  </>
                ) : (
                  <>
                    <div className="sidebar-symbol">⌖</div>
                    <h3>당신의 발견이 소중해요</h3>
                    <p>
                      공식 신고를 돕는 준비 공간입니다. 긴급한 상황은 지역의
                      긴급 신고 체계를 이용하세요.
                    </p>
                  </>
                )}
                {step > 2 && (
                  <button
                    className="secondary"
                    onClick={() => setStep(step - 1)}
                  >
                    ← 이전 단계
                  </button>
                )}
              </aside>
            </div>
          </>
        )}
        {(view === "mine" || view === "map") && (
          <>
            <div className="page-title">
              <span className="eyebrow">
                {view === "map" ? "NEIGHBORHOOD REPORTS" : "MY REPORTS"}
              </span>
              <h1>
                {view === "map"
                  ? mapMode === "risk"
                    ? "우리 동네 AI 위험 지도"
                    : "우리 동네 제보 지도"
                  : "내가 남긴 제보"}
              </h1>
              <p>
                {view === "map"
                  ? "제보 수는 사고 수나 기관이 검증한 위험 수준이 아닙니다."
                  : "현재 브라우저에서 작성한 기록입니다. 쿠키를 삭제하면 수정 권한을 복구할 수 없습니다."}
              </p>
            </div>
            {view === "map" && (
              <div className="map-modes">
                <button
                  className={mapMode === "reports" ? "selected" : ""}
                  onClick={() => setMapMode("reports")}
                >
                  제보 수·신고 상태
                </button>
                <button
                  className={mapMode === "risk" ? "selected" : ""}
                  onClick={() => setMapMode("risk")}
                >
                  AI 추정 위험도
                </button>
              </div>
            )}
            {view === "map" && mapMode === "risk" && (
              <section className="risk-map-intro">
                <h3>AI 추정치이며 현장 확인이 필요합니다</h3>
                <p>
                  개별 사진·설명에 나타난 위험을 평가합니다. 제보 수만으로
                  위험도를 높이지 않으며 신고 완료도 수리 완료를 뜻하지
                  않습니다. 근접 핀 색은 평가된 제보 중 가장 높은 위험도, 핀
                  숫자는 제보 건수입니다. 미평가 제보가 섞여 있을 수 있으므로
                  상세를 확인하세요.
                </p>
                <div className="risk-legend">
                  {Object.entries(riskLabels).map(([key, name]) => (
                    <button
                      key={key}
                      className={
                        "risk-badge risk-" +
                        key +
                        (riskFilter === key ? " chosen" : "")
                      }
                      onClick={() =>
                        setRiskFilter(riskFilter === key ? "ALL" : key)
                      }
                    >
                      {name}
                    </button>
                  ))}
                  <button
                    className="text-button"
                    onClick={() => setRiskFilter("ALL")}
                  >
                    전체 위험도
                  </button>
                </div>
              </section>
            )}
            <div className="filters">
              {[["ALL", "전체"], ...Object.entries(labels)].map(
                ([key, name]) => (
                  <button
                    className={filter === key ? "selected" : ""}
                    key={key}
                    onClick={() => setFilter(key)}
                  >
                    {name}
                  </button>
                ),
              )}
              <span>{visibleRows.length}건</span>
            </div>
            {view === "map" && (
              <Map
                points={visibleRows}
                riskMode={mapMode === "risk"}
                onSelect={(id) => void open(id)}
              />
            )}
            <div className="report-list">{visibleRows.map(card)}</div>
            {!visibleRows.length && (
              <div className="empty">
                <span>⌖</span>
                <h3>
                  {rows.length
                    ? "조건에 맞는 제보가 없어요"
                    : "아직 등록된 제보가 없어요"}
                </h3>
                <p>
                  {rows.length
                    ? "다른 상태나 위험도 필터를 선택해 보세요."
                    : "작은 발견부터 기록해 보세요."}
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setR(null);
                    setStep(1);
                    void navigate("write");
                  }}
                >
                  첫 제보 시작하기
                </button>
              </div>
            )}
          </>
        )}
        {view === "detail" && r && (
          <>
            <div className="page-title">
              <span className="eyebrow">REPORT DETAIL</span>
              <h1>{r.title || "작성 중인 제보"}</h1>
              <span className={"badge " + r.status}>{labels[r.status]}</span>
            </div>
            <div className="workspace">
              <section className="panel">
                <span className="eyebrow">
                  {r.riskType} ·{" "}
                  {new Date(r.uploadedAt).toLocaleString("ko-KR")}
                </span>
                <p className="description">
                  {r.description || "아직 설명이 없습니다."}
                </p>
                <RiskAssessment
                  key={r.id}
                  report={r}
                  busy={busy}
                  onAnalyze={
                    r.isOwner
                      ? () =>
                          void run(async () => {
                            const updated = await request<Report>(
                              "/" + r.id + "/risk",
                              "POST",
                              { consent: true },
                            );
                            setR(updated);
                            setNotice(
                              "AI 위험도를 분석했습니다. 판단 근거와 현장 상황을 함께 확인하세요.",
                            );
                          })
                      : undefined
                  }
                />
                {r.isOwner || r.photoPublic ? (
                  <img
                    className="detail-photo"
                    src={"/api/reports/" + r.id + "/image"}
                    alt="제보 사진"
                  />
                ) : (
                  <div className="photo-private">
                    사진은 작성자만 볼 수 있습니다.
                  </div>
                )}
                <Map
                  lat={r.latitude}
                  lon={r.longitude}
                  points={r.latitude != null ? [r] : []}
                  onSelect={() => {}}
                />
                {r.isOwner && (
                  <>
                    <h3>신고문</h3>
                    <pre>
                      {r.draftText || "작성 단계에서 신고문을 준비하세요."}
                    </pre>
                    <button
                      className="secondary"
                      onClick={() =>
                        run(async () => {
                          await navigator.clipboard.writeText(
                            r.draftText || "",
                          );
                          setNotice("복사했습니다.");
                        })
                      }
                    >
                      신고문 복사
                    </button>
                    <h3>공개 범위 수정</h3>
                    {privacy}
                    <button
                      className="secondary"
                      disabled={busy || r.isDraft || (photo && !confirmed)}
                      onClick={() =>
                        run(async () => {
                          setR(
                            await request<Report>(
                              "/" + r.id + "/visibility",
                              "PATCH",
                              {
                                isPublic: share,
                                photoPublic: photo,
                                photoConfirmed: confirmed,
                              },
                            ),
                          );
                          setNotice("공개 범위를 변경했습니다.");
                        })
                      }
                    >
                      공개 범위 저장
                    </button>
                    {r.history && (
                      <>
                        <h3>상태 변경 기록</h3>
                        {r.history.map((h) => (
                          <p key={h.id} className="muted">
                            {new Date(h.changedAt).toLocaleString("ko-KR")} ·{" "}
                            {labels[h.toStatus]} (
                            {h.changeSource === "EXPIRY"
                              ? "10분 경과"
                              : "사용자 변경"}
                            )
                          </p>
                        ))}
                      </>
                    )}
                  </>
                )}
              </section>
              <aside className="panel sidebar">
                <h3>{r.isOwner ? "신고 진행 상태" : "공개 제보 안내"}</h3>
                <p>
                  신고 완료는 작성자가 표시한 상태이며 기관 접수·처리·수리
                  완료를 뜻하지 않습니다.
                </p>
                {r.isOwner && (
                  <>
                    <p className="timer">
                      {remaining > 0
                        ? `미완료 전환까지 ${Math.floor(remaining / 60)}분 ${remaining % 60}초`
                        : "10분이 지났어도 신고를 완료할 수 있어요."}
                    </p>
                    {!r.isDraft && (
                      <>
                        <div className="office">
                          <h3>{currentOffice.name}</h3>
                          <p>{currentOffice.help}</p>
                          {currentOffice.url && (
                            <a
                              href={currentOffice.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              공식 신고 사이트 ↗
                            </a>
                          )}
                        </div>
                        <button
                          className="primary wide"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              setR(
                                await request<Report>(
                                  "/" + r.id + "/status",
                                  "PATCH",
                                  { reported: true },
                                ),
                              );
                            })
                          }
                        >
                          신고 완료 표시 (사용자 확인)
                        </button>
                        <button
                          className="secondary wide"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              setR(
                                await request<Report>(
                                  "/" + r.id + "/status",
                                  "PATCH",
                                  { reported: false },
                                ),
                              );
                            })
                          }
                        >
                          {r.status === "USER_REPORTED"
                            ? "완료 표시 취소"
                            : "아직 신고 안 함"}
                        </button>
                      </>
                    )}
                    <button
                      className="secondary wide"
                      onClick={() => {
                        setStep(2);
                        setView("write");
                      }}
                    >
                      제보 내용 이어 쓰기·수정
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "사진과 제보 기록을 삭제할까요? 되돌릴 수 없습니다.",
                          )
                        )
                          void run(async () => {
                            await request("/" + r.id, "DELETE");
                            setR(null);
                            await navigate("mine");
                          });
                      }}
                    >
                      사진과 제보 삭제
                    </button>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
        {view === "guide" && (
          <>
            <div className="page-title">
              <span className="eyebrow">BEFORE YOU START</span>
              <h1>안전하게 함께 이용해요</h1>
              <p>SafeReport이 도울 수 있는 일과 알아두어야 할 한계입니다.</p>
            </div>
            <div className="guide-grid">
              {[
                [
                  "신고 준비를 돕습니다",
                  "공식 기관에 자동 접수하지 않습니다. 안내된 신고처에 직접 제출한 뒤 완료 상태를 표시하세요.",
                ],
                [
                  "우리 앱 안에서만 비교합니다",
                  "공개된 앱 제보만 중복 검색합니다. 안전신문고의 전체 신고 내역이나 처리 결과를 조회하지 않습니다.",
                ],
                [
                  "사진 공개는 두 번 확인합니다",
                  "초안과 사진은 기본 비공개입니다. 요약 공개와 사진 공개는 별도로 선택하며 사진은 재확인 후 공개됩니다.",
                ],
                [
                  "AI 결과는 직접 확인하세요",
                  "사진과 설명은 동의 후 외부 AI 제공자에게 전송됩니다. AI 분석과 중복 판단은 틀릴 수 있고 수동 입력으로 대체할 수 있습니다.",
                ],
                [
                  "현재 브라우저에 연결됩니다",
                  "로그인 없이 보안 쿠키로 수정 권한을 확인합니다. 다른 기기 또는 쿠키 삭제 후에는 기존 기록의 권한을 복구할 수 없습니다.",
                ],
                [
                  "10분은 취소 기한이 아닙니다",
                  "사진 업로드 10분 후 미완료로 표시됩니다. 페이지를 닫아도 기준은 유지되며 나중에도 완료로 바꿀 수 있습니다.",
                ],
              ].map(([title, text]) => (
                <section className="panel" key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </section>
              ))}
            </div>
            <aside className="home-note">
              ⓘ 긴급한 위험이나 응급상황은 앱 작성보다 해당 지역의 긴급 신고
              체계를 우선 이용하세요.
            </aside>
          </>
        )}
      </main>
      <footer>
        <a className="brand" href="/">
          SafeReport<span className="brand-tag">작은 발견, 안전한 일상</span>
        </a>
        <p>로컬 MVP · 공식 기관의 접수·처리 결과를 확인하지 않습니다.</p>
        <span>MADE FOR A SAFER EVERYDAY</span>
      </footer>
      {confirmOpen && r && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-title"
          >
            <h2 id="photo-title">이 사진을 공개할까요?</h2>
            <img
              src={"/api/reports/" + r.id + "/image"}
              alt="공개 전 사진 확인"
            />
            <p>
              다른 사용자가 사진을 볼 수 있습니다. 얼굴·차량번호·집 주소 등
              개인정보가 없는지 다시 확인해 주세요. 자동 가림은 제공하지
              않습니다.
            </p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => {
                  setPhoto(false);
                  setConfirmed(false);
                  setConfirmOpen(false);
                }}
              >
                사진 비공개 유지
              </button>
              <button
                className="primary"
                onClick={() => {
                  setConfirmed(true);
                  setConfirmOpen(false);
                }}
              >
                확인했으며 사진 공개에 동의
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
