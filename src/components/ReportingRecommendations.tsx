/** 네 번째 화면과 본인 상세에서 같은 근거·공식 링크를 보여줍니다. 추가 AI 호출은 없습니다. */
import { recommendReporting, type RoutingInput } from "@/lib/reporting";
export default function ReportingRecommendations({
  report,
  emergencyOnly = false,
}: {
  report: RoutingInput;
  emergencyOnly?: boolean;
}) {
  const result = recommendReporting(report);
  return (
    <>
      {result.emergencies.length > 0 && (
        <aside className="sr-routing-emergency" aria-label="긴급 연락 안내">
          <h2>지금 위험하다면 긴급 연락부터</h2>
          {result.emergencies.map(({ channel, reason }) => (
            <div key={channel.id}>
              <p>{reason}</p>
              <a href={`tel:${channel.phone}`}>
                {channel.name} 전화하기
              </a> ·{" "}
              <a
                href={channel.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                공식 근거 ↗
              </a>
            </div>
          ))}
          <p className="sr-small">
            대한민국 긴급 연락 안내입니다. 해외라면 현지 긴급번호를 확인하세요.
          </p>
          {!emergencyOnly && (
            <p className="sr-small">
              자동 신고나 긴급 출동 요청 기능은 아닙니다.
            </p>
          )}
        </aside>
      )}
      {!emergencyOnly && (
        <section className="sr-office sr-routing" aria-label="추천 신고처">
          <span className="sr-kicker">추천 신고처</span>
          <h2>
            {result.confidence === "uncertain"
              ? "확인이 필요해 일반 창구를 안내합니다"
              : "상황에 맞는 공식 창구"}
          </h2>
          <p className="sr-small">
            최종 접수 대상과 관할은 공식 창구에서 확인해 주세요. 이 사이트에서는
            신고가 접수되지 않습니다.
          </p>
          {result.recommendations.map(({ channel, reason }, i) => (
            <article className="sr-routing-card" key={channel.id}>
              <span className="sr-kicker">
                {i === 0 ? "우선 안내" : "추가 확인 창구"} · {channel.agency}
              </span>
              <h3>{channel.name}</h3>
              <p>{reason}</p>
              <a
                className={i === 0 ? "sr-primary" : "sr-secondary"}
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {channel.name} 열기 ↗
              </a>
              {channel.contactNote && <p>{channel.contactNote}</p>}
              <details>
                <summary>신고 대상·공식 출처</summary>
                <p>
                  {channel.targets} · {channel.scope}
                </p>
                <a
                  href={channel.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {channel.source.title} ↗
                </a>
                <p className="sr-small">출처 확인: {channel.reviewedAt}</p>
              </details>
            </article>
          ))}
          {result.cautions.map((c, i) => (
            <aside className="sr-routing-caution" key={i}>
              <strong>제출 전 확인</strong>
              <p>{c.text}</p>
              {c.source && (
                <a
                  href={c.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.source.title} ↗
                </a>
              )}
            </aside>
          ))}
          <details className="sr-routing-basis">
            <summary>추천 근거와 한계</summary>
            {result.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            <p>
              긴급상황은 화재·구조·구급 119, 범죄·폭력 112를 이용하세요. AI는
              기관명·전화·링크를 결정하지 않습니다.
            </p>
          </details>
        </section>
      )}
    </>
  );
}
