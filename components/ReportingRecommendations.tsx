"use client";
/** 신고처·복사 버튼과 꼭 필요한 증빙 안내만 보여줍니다. 링크는 검증 DB에서만 가져옵니다. */
import { useState } from "react";
import {
  recommendReporting,
  reportingDatabase,
  type RoutingInput,
} from "@/lib/reporting";
export default function ReportingRecommendations({
  report,
  emergencyOnly = false,
}: {
  report: RoutingInput;
  emergencyOnly?: boolean;
}) {
  const result = recommendReporting(report);
  const [copied, setCopied] = useState("");
  const help = reportingDatabase.channels.find((c) => c.id === "help")!;
  async function copyOffice(name: string, url: string) {
    try {
      await navigator.clipboard.writeText(`${name}\n${url}`);
      setCopied(`${name} 신고처를 복사했습니다.`);
    } catch {
      setCopied("복사하지 못했습니다. 링크 주소를 직접 복사해 주세요.");
    }
  }
  return (
    <>
      {result.emergencies.length > 0 && (
        <aside className="sr-routing-emergency" aria-label="긴급 연락 안내">
          <h2>지금 위험하다면 긴급 연락부터</h2>
          {result.emergencies.map(({ channel, reason }) => (
            <div key={channel.id}>
              <p>{reason}</p>
              <a href={`tel:${channel.phone}`}>{channel.name} 전화하기</a>
            </div>
          ))}
        </aside>
      )}
      {!emergencyOnly && (
        <>
          <section className="sr-office sr-routing" aria-label="추천 신고처">
            <span className="sr-kicker">추천 신고처</span>
            <h2>
              {result.confidence === "uncertain"
                ? "신고처 확인이 필요합니다"
                : "상황에 맞는 신고처"}
            </h2>
            {result.recommendations.map(({ channel, reason }, i) => (
              <article className="sr-routing-card" key={channel.id}>
                <span className="sr-kicker">
                  {channel.kind === "directory"
                    ? "학교 연락처 확인"
                    : i === 0
                      ? "우선 안내"
                      : "함께 확인"}{" "}
                  · {channel.agency}
                </span>
                <h3>{channel.name}</h3>
                <p>{reason}</p>
                <div className="sr-office-actions">
                  <a
                    className={i === 0 ? "sr-primary" : "sr-secondary"}
                    href={channel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {channel.name} 열기 ↗
                  </a>
                  <button
                    className="sr-copy"
                    aria-label={`${channel.name} 신고처 복사`}
                    onClick={() => copyOffice(channel.name, channel.url)}
                  >
                    신고처 복사
                  </button>
                </div>
                {channel.contactNote && (
                  <p className="sr-small">{channel.contactNote}</p>
                )}
                <details>
                  <summary>신고 대상·공식 출처</summary>
                  <p>{channel.targets}</p>
                  <a
                    href={channel.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {channel.source.title} ↗
                  </a>
                  <p className="sr-small">확인일 {channel.reviewedAt}</p>
                </details>
              </article>
            ))}
            {copied && (
              <p role="status" className="sr-small">
                {copied}
              </p>
            )}
            {result.cautions.length > 0 && (
              <aside className="sr-routing-caution">
                <strong>제출 전 확인</strong>
                {result.cautions.map((c, i) => (
                  <p key={i}>
                    {c.text}
                    {c.source && (
                      <>
                        {" "}
                        <a
                          href={c.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          촬영 기준 ↗
                        </a>
                      </>
                    )}
                  </p>
                ))}
              </aside>
            )}
            <details className="sr-routing-basis">
              <summary>추천 기준</summary>
              <p>
                사진·위치·위험 유형을 참고합니다. 실제 접수 대상과 담당 기관은
                신고처에서 확인해 주세요.
              </p>
              {result.confidence === "uncertain" && (
                <p>정보가 불확실해 일반 신고 창구를 안내합니다.</p>
              )}
              {result.regional && (
                <p>
                  지역 경계:{" "}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    © OpenStreetMap 기여자
                  </a>
                </p>
              )}
            </details>
          </section>
          <aside className="sr-routing-help">
            <p>
              어디에 신고해야 할지 모르겠다면{" "}
              <a href={`tel:${help.phone}`}>정부민원안내콜센터 110</a>으로 문의
              가능합니다.
            </p>
            <p>
              긴급 상황 시 화재·구조·구급 <a href="tel:119">119</a>, 범죄·폭력{" "}
              <a href="tel:112">112</a>를 이용하세요.
            </p>
            <p>
              전국 공통 신고처를 우선 안내하며, 공식 정보가 확인된 지역
              기관·학교 안내를 확대합니다.
            </p>
          </aside>
        </>
      )}
    </>
  );
}
