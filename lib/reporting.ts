/** 공식 출처를 수동 검증한 버전 관리형 신고처 DB와 다중 근거 추천 규칙.
 * 기관명·전화·URL은 오직 DB에서 가져오며 AI 출력으로 생성하거나 덮어쓰지 않습니다.
 */
import database from "../data/reporting-channels.json";
import seoulArea from "../data/reporting-area-seoul.json";
import { inRegion, type LocationResult } from "./location";
export const reportingDatabase = database;
export type RoutingInput = {
  description: string;
  riskType: string;
  locationLabel?: string;
  latitude?: number | null;
  longitude?: number | null;
  placeType?: string;
  aiSummary?: string;
  riskAssessedAt?: string | Date | null;
};
type Channel = (typeof database.channels)[number];
const channel = (id: string): Channel =>
  database.channels.find((c) => c.id === id)!;
/** 부정·과거·가정 표현은 현재 발생 근거에서 제외합니다. 문장별로 판단해 다른 실제 위험은 보존합니다. */
function positive(text: string, pattern: RegExp) {
  return text
    .replace(/하지만|그런데|(?:아니|없|않)(?:지만|고)/g, "$&\n")
    .split(/[.!?。,，;；\n]/)
    .some(
      (sentence) =>
        pattern.test(sentence) &&
        !/아님|아니|않|꺼[졌짐져]|진압|종료|가정|만약|예방|가능성|우려|위험성|(?:화재|연기|불꽃|가스\s*누출|가스\s*냄새|폭행|폭력|범죄|정전|주차)(?:\s*위험)?(?:이|가|는|은)?\s*(?:없|미발생)/.test(
          sentence,
        ),
    );
}
const parking =
  /불법\s*주[정차]|주정차|불법\s*주차|횡단보도.{0,15}주차|소화전.{0,15}주차|인도.{0,15}주차|주차.{0,15}(횡단보도|소화전|인도)/;
const supply = /정전|전력\s*공급|전신주|전봇대|송전선|배전선|변압기/;
const inside = /교실|교내|복도|운동장|급식실|내부|실내/;
const publicRoad =
  /학교\s*앞|학교\s*밖|통학로|횡단보도|인도|보도블록|공공도로|차도/;
/** 불명으로 끝나는 대상 목록을 실제 관찰과 구분합니다. 쉼표로 나누면 목록 끝의 ‘불명’이 유실됩니다. */
function observedCategory(text: string, pattern: RegExp) {
  return text
    .split(/[.!?。\n]/)
    .some(
      (sentence) =>
        positive(sentence, pattern) &&
        !/불명|불분명|미확인|알\s*수\s*없|확인(?:할\s*수\s*없|되지|하기\s*어렵)|관찰되지|보이지|관련.{0,6}없|해당.{0,6}없/.test(
          sentence,
        ),
    );
}
/** 사진 AI 관찰(현재 입력에 대한 분석만), GPS, 장소 설명, 위험 분류를 함께 평가합니다.
 * GPS 범위 검사는 국내 가능성을 가리는 보수적 선별이며 관할구역 판정이 아닙니다.
 * 검증된 지자체 경계 DB가 없으므로 좌표만으로 특정 시·구청을 추측하지 않습니다.
 */
export function recommendReporting(input: RoutingInput) {
  const location = input.locationLabel || "";
  const user = input.description || "";
  const observed = input.riskAssessedAt ? input.aiSummary || "" : "";
  const text = `${location}\n${user}`;
  const all = `${text}\n${observed}`;
  const { latitude: lat, longitude: lon } = input;
  const hasGPS =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lon === "number" &&
    Number.isFinite(lon);
  const domestic =
    hasGPS && lat >= 32.7 && lat <= 38.9 && lon >= 124.3 && lon <= 132;
  const seoulGPS =
    domestic && inRegion(input, seoulArea as unknown as LocationResult);
  const locationMismatch =
    domestic &&
    ((/서울/.test(location) && !seoulGPS) ||
      (seoulGPS &&
        /^(?:부산|대구|인천|광주|대전|울산|강릉|제주|경기|강원)/.test(
          location,
        )));
  const conflict =
    locationMismatch ||
    Boolean(
      observed &&
      (/설명.{0,20}(불일치|일치하지|모순)|사진.{0,20}(불일치|일치하지|모순)/.test(
        observed,
      ) ||
        (observedCategory(user, parking) &&
          /차량.{0,10}(없|아님)|주차.{0,10}(없|아님)/.test(observed)) ||
        (observedCategory(text, publicRoad) &&
          observedCategory(observed, /학교\s*내부|건물\s*내부/)) ||
        (observedCategory(observed, supply) &&
          /정전.{0,8}(아님|없)|전력.{0,8}무관/.test(user))),
    );
  const insufficient =
    (!user.trim() && !observed.trim()) ||
    (input.riskType === "기타" &&
      !/파손|균열|고장|위험|불법|주차|침수|쓰레기|오염|누수|정전|전봇대|전신주|화재|연기|폭행|쓰러|가스/.test(
        all,
      ));
  const cautions: { text: string; source?: { title: string; url: string } }[] =
    [];
  const reasons: string[] = [];
  if (!hasGPS)
    reasons.push("위치가 확인되지 않아 관할 기관을 특정할 수 없습니다.");
  else if (!domestic) reasons.push("국내 위치인지 확인이 필요합니다.");
  else reasons.push("위치·사진 관찰·위험 유형을 참고했습니다.");
  if (conflict)
    reasons.push("위치 또는 사진·설명이 일치하지 않아 확인이 필요합니다.");
  if (insufficient)
    reasons.push(
      "관찰된 위험을 구체적으로 분류하기 어려워 일반 창구를 안내합니다.",
    );
  if (!observed) reasons.push("AI 분석 없이 입력한 위치·상황을 참고했습니다.");
  else reasons.push("사진 AI 관찰과 위치·상황을 함께 참고했습니다.");
  const picks: { channel: Channel; reason: string }[] = [];
  const add = (id: string, reason: string) =>
    picks.push({ channel: channel(id), reason });
  const roadObserved = observedCategory(text, publicRoad);
  const school =
    !roadObserved &&
    observedCategory(`${user}\n${observed}`, inside) &&
    (/학교/.test(location) || input.placeType === "학교");
  const privateInside =
    !roadObserved &&
    (input.placeType === "사유시설" ||
      /아파트|상가|사유지|건물\s*내부/.test(location));
  const isParking = observedCategory(all, parking);
  if (isParking) {
    cautions.push({
      text: "불법 주정차는 공식 앱에서 직접 촬영해야 할 수 있습니다. 촬영 간격·대상은 해당 지자체 기준을 확인하세요.",
      source: database.parkingSource,
    });
    if (privateInside)
      cautions.push({
        text: "사유지 주차는 신고 대상 여부를 먼저 확인하세요.",
      });
  }
  if (!domestic || conflict || insufficient) {
    add("safety", "상황이나 관할이 불확실해 일반 안전 신고 창구를 안내합니다.");
  } else if (school) {
    add(
      "school",
      "학교 내부 시설로 보입니다. 지역·학교명을 검색해 해당 학교 관리자 연락처를 확인하세요.",
    );
    add(
      "civil",
      "교육청 등 행정기관의 확인이 필요하면 일반민원으로 문의하세요.",
    );
  } else if (
    !isParking &&
    !privateInside &&
    observedCategory(all, supply) &&
    (input.riskType === "전기·화재" || observedCategory(user, supply))
  ) {
    add(
      "power",
      "정전·전력 공급 설비 고장으로 보여 전기 고장 상담을 안내합니다.",
    );
    add(
      "safety",
      "도로·보행 위험이 함께 있다면 안전신문고도 이용할 수 있습니다.",
    );
  } else {
    add(
      "safety",
      isParking
        ? "주정차 관련 상황으로 보여 불법 주정차 신고 창구를 안내합니다."
        : `장소 설명과 ${["보행 위험", "도로·교통", "시설 파손", "전기·화재"].includes(input.riskType) ? input.riskType : "생활안전"} 상황에 맞는 생활안전 신고 창구입니다.`,
    );
    if (privateInside) {
      cautions.push({
        text: "사유시설은 안내판·공식 홈페이지에서 관리자 연락처를 확인해 먼저 알려주세요.",
      });
      add(
        "civil",
        "시설의 관리·감독 기관을 확인해야 한다면 일반민원으로 문의하세요.",
      );
    }
  }
  if (
    domestic &&
    !conflict &&
    !insufficient &&
    seoulGPS &&
    !school &&
    !privateInside &&
    !isParking &&
    picks.length === 1
  ) {
    add(
      "seoul",
      "서울 지역 경계와 선택한 위치를 참고해 서울시 민원 창구를 함께 안내합니다.",
    );
  }
  const emergencies: { channel: Channel; reason: string }[] = [];
  // 높은 AI 위험도 자체는 긴급신고 사유로 쓰지 않습니다. 장소 이름도 발생 증거가 아닙니다.
  const incident = `${user}\n${observed}`;
  const fire = positive(
    incident,
    /불이\s*(났|나고|붙)|화재\s*(발생|중)|연기가\s*(나|치솟)|타고\s*있|가스\s*(누출|냄새)|의식[이은]?\s*없|쓰러져|갇혀|피가\s*(나|흐르)|숨[을이]?\s*(못|쉬지)|붕괴\s*(중|발생)/,
  );
  const crime = positive(
    incident,
    /폭행|폭력|흉기|칼로\s*위협|범죄\s*(중|발생)|사람을\s*때리|살려\s*달라/,
  );
  if (fire)
    emergencies.push({
      channel: channel("fire"),
      reason: "현재 위급하다면 안전한 곳으로 이동하고 119에 연락하세요.",
    });
  if (crime)
    emergencies.push({
      channel: channel("police"),
      reason:
        "현재 범죄·폭력의 위협이 있다면 안전을 확보하고 112에 연락하세요.",
    });
  if (!domestic && emergencies.length)
    cautions.push({
      text: "112·119는 대한민국 긴급 연락 안내입니다. 해외라면 현지 긴급번호를 확인하세요.",
    });
  return {
    version: database.version,
    regional: seoulGPS && !locationMismatch ? "서울특별시" : null,
    confidence:
      !domestic || conflict || insufficient ? "uncertain" : "contextual",
    reasons,
    recommendations: picks.slice(0, 2),
    emergencies,
    cautions,
  };
}
