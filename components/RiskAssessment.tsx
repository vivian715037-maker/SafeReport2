"use client";
/** 제보별 AI 위험도·근거·시각을 표시합니다. 본인만 별도 전송 동의 후 기존 사진을 재평가할 수 있습니다. */
import { useState } from "react";
import { riskLabels } from "@/lib/risk";
type Assessment = {
  riskLevel?: string;
  riskReason?: string;
  riskAssessedAt?: string | null;
  isOwner: boolean;
};
/** 분석하지 않은 상태는 LOW로 대체하지 않고 판단 불가로 표시합니다. */
export default function RiskAssessment({
  report,
  busy,
  onAnalyze,
}: {
  report: Assessment;
  busy?: boolean;
  onAnalyze?: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const level = report.riskLevel || "UNKNOWN";
  return (
    <section
      className={"risk-assessment risk-" + level}
      aria-label="AI 위험도 평가"
    >
      <div className="risk-heading">
        <span className="eyebrow">AI ESTIMATED RISK</span>
        <span className={"risk-badge risk-" + level}>
          {riskLabels[level] || riskLabels.UNKNOWN}
        </span>
      </div>
      <h3>AI 추정 위험도</h3>
      <p>
        {report.riskReason ||
          "아직 평가되지 않았습니다. 사진과 설명으로 판단할 수 없으면 판단 불가로 표시합니다."}
      </p>
      {report.riskAssessedAt && (
        <small>
          분석 시각: {new Date(report.riskAssessedAt).toLocaleString("ko-KR")}
        </small>
      )}
      <p className="muted">
        AI 추정치이며 현장 확인이 필요합니다. 신고 완료·제보 건수는 위험도나
        수리 완료의 근거가 아닙니다.
      </p>
      {report.isOwner && onAnalyze && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            사진과 설명을 외부 AI에 보내 위험도를 분석하는 데 동의합니다. 제보가
            공개 상태이면 결과와 이유도 지도에 표시됩니다.
          </label>
          <button
            className="secondary"
            disabled={!consent || busy}
            onClick={onAnalyze}
          >
            ✧ AI 위험도 분석
          </button>
        </>
      )}
    </section>
  );
}
