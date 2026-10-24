/** 공식 출처를 수동 검증한 버전 관리형 신고처 DB와 다중 근거 추천 규칙.
 * 기관명·전화·URL은 오직 DB에서 가져오며 AI 출력으로 생성하거나 덮어쓰지 않습니다.
 */
import database from "../data/reporting-channels.json";
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
const inside = /교실|교내|학교\s*(내부|안)|복도|운동장|급식실/;
const publicRoad =
  /학교\s*앞|학교\s*밖|통학로|횡단보도|인도|보도블록|공공도로|차도/;
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
  const conflict = Boolean(
    observed &&
    (/설명.{0,20}(불일치|일치하지|모순)|사진.{0,20}(불일치|일치하지|모순)/.test(
      observed,
    ) ||
      (parking.test(user) &&
        /차량.{0,10}(없|아님)|주차.{0,10}(없|아님)/.test(observed)) ||
      (publicRoad.test(text) && /학교\s*내부|건물\s*내부/.test(observed)) ||
      (supply.test(observed) &&
        /정전.{0,8}(아님|없)|전력.{0,8}무관/.test(user))),
  );
  const insufficient =
    !user.trim() ||
    (input.riskType === "기타" &&
      !/파손|균열|고장|위험|불법|주차|침수|쓰레기|오염|누수|정전|전봇대|전신주|화재|연기|폭행|쓰러|가스/.test(
        all,
      ));
  const cautions: { text: string; source?: { title: string; url: string } }[] =
    [];
  const reasons: string[] = [];
  if (!hasGPS)
    reasons.push("위치가 확인되지 않아 관할 기관을 특정할 수 없습니다.");
  else if (!domestic)
    reasons.push(
      "선택한 좌표가 국내 서비스 범위인지 확인되지 않습니다. 국내 신고 창구의 적용 여부를 먼저 확인하세요.",
    );
  else
    reasons.push(
      "선택한 GPS 좌표는 국내 가능 범위입니다. 정확한 관할·시설 관리 주체는 접수처에서 확인해야 합니다.",
    );
  if (conflict)
    reasons.push(
      "사진 분석과 입력 설명이 일치하지 않아 일반 신고 창구를 안내합니다.",
    );
  if (insufficient)
    reasons.push(
      "관찰된 위험을 구체적으로 분류하기 어려워 일반 창구를 안내합니다.",
    );
  if (!observed)
    reasons.push(
      "현재 입력에 대한 사진 AI 분석이 없어 설명·위치·위험 유형으로 추천했습니다.",
    );
  else
    reasons.push(
      "사진 AI 관찰과 입력 설명·위치·위험 유형을 함께 검토했습니다. 사진만으로 소유·관할을 확정하지 않습니다.",
    );
  const picks: { channel: Channel; reason: string }[] = [];
  const add = (id: string, reason: string) =>
    picks.push({ channel: channel(id), reason });
  const school =
    !publicRoad.test(text) &&
    ((/학교/.test(location) && inside.test(all)) ||
      (input.placeType === "학교" && inside.test(all)));
  const privateInside =
    !publicRoad.test(text) &&
    (input.placeType === "사유시설" ||
      /아파트|상가|사유지|건물\s*내부/.test(location));
  const isParking = positive(all, parking);
  if (isParking) {
    cautions.push({
      text: "불법 주정차 주민신고는 안전신문고 공식 앱의 촬영 기능 등 증빙 요건을 확인하세요. 이 사이트에 올린 사진·AI 신고문만으로 인정되지 않을 수 있어 공식 앱에서 다시 촬영해야 할 수 있습니다. 촬영 간격·운영 시간·대상은 해당 지자체 공고를 확인하세요.",
      source: database.parkingSource,
    });
    if (privateInside)
      cautions.push({
        text: "사유지·아파트 내부 주차는 도로의 불법 주정차 신고 대상과 다를 수 있습니다. 관리 주체와 적용 기준을 먼저 확인하세요.",
      });
  }
  if (!domestic || conflict || insufficient) {
    add(
      "safety",
      "자료 또는 위치가 불충분해 생활안전 일반 창구를 우선 안내합니다. 현장·관할 확인이 필요합니다.",
    );
  } else if (school) {
    add(
      "civil",
      "학교 내부 시설 문제로 보입니다. 학교 관리자에게 먼저 알리고, 교육청 등 행정기관의 확인이 필요하면 일반민원에서 소관기관을 선택하세요.",
    );
    add(
      "safety",
      "시설 파손 등 안전 위험에 대한 현장 확인 요청도 준비할 수 있습니다. 접수 대상 여부를 확인하세요.",
    );
  } else if (
    !isParking &&
    !privateInside &&
    positive(all, supply) &&
    (input.riskType === "전기·화재" || positive(user, supply))
  ) {
    add(
      "power",
      "정전·전력 공급 설비 관련 관찰이 있어 전기 고장 상담을 우선 안내합니다. 전봇대 등의 소유 주체는 현장에서 확인해야 합니다.",
    );
    add(
      "safety",
      "보행·도로의 시설 위험이 함께 있다면 안전신문고로 현장 확인을 요청할 수 있습니다.",
    );
  } else {
    add(
      "safety",
      isParking
        ? "주정차 관련 설명·관찰이 있어 안전신문고의 불법 주정차 신고 대상을 확인하는 것이 적절합니다. 위반 여부를 확정한 것은 아닙니다."
        : `장소 설명과 ${["보행 위험", "도로·교통", "시설 파손", "전기·화재"].includes(input.riskType) ? input.riskType : "생활안전"} 유형을 고려해 위험 시설의 확인·조치를 요청하는 창구를 안내합니다.`,
    );
    if (privateInside) {
      cautions.push({
        text: "건물 내부·사유시설은 안내판이나 공식 홈페이지에서 실제 관리자 연락처를 확인해 먼저 알려주세요. 특정 관리사무소 이름·연락처는 추측하지 않습니다.",
      });
      add(
        "civil",
        "공공기관의 감독·소관 확인이 필요하다면 일반민원으로 문의하세요. 사인 간 분쟁·보수 요청의 직접 처리 여부는 별도 확인이 필요합니다.",
      );
    }
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
      reason:
        "화재·구조·구급이 필요한 상황일 수 있습니다. 안전한 곳으로 이동하고 현재 위급하다면 신고문 작성보다 119 연락을 우선하세요.",
    });
  if (crime)
    emergencies.push({
      channel: channel("police"),
      reason:
        "폭력·범죄로 즉각적인 현장 대응이 필요할 수 있습니다. 안전을 확보하고 현재 위협이 있다면 112에 연락하세요.",
    });
  if (!domestic && emergencies.length)
    cautions.push({
      text: "112·119는 대한민국 긴급 연락 안내입니다. 해외라면 현지 긴급번호를 확인하세요.",
    });
  return {
    version: database.version,
    confidence:
      !domestic || conflict || insufficient ? "uncertain" : "contextual",
    reasons,
    recommendations: picks.slice(0, 2),
    emergencies,
    cautions,
  };
}
