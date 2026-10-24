/** 로컬 서버용 장소 검색. Nominatim 수동 검색·1초당 1회 제한·캐시 정책을 지키며 키 없이 동작합니다. */
import { z } from "zod";
import type { LocationResult, Boundary } from "./location";
const cache = new Map<string, { expires: number; results: LocationResult[] }>();
let queue = Promise.resolve();
let lastRequest = 0;
let pending = 0;
export class LocationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const point = z.array(z.number().finite()).length(2);
const boundarySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(point)),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(point))),
  }),
]);
const resultSchema = z
  .array(
    z.object({
      place_id: z.union([z.number(), z.string()]),
      display_name: z.string(),
      lat: z.coerce.number().min(-85).max(85),
      lon: z.coerce.number().min(-180).max(180),
      boundingbox: z.array(z.coerce.number()).length(4),
      class: z.string().optional(),
      type: z.string().optional(),
      geojson: z.unknown().optional(),
    }),
  )
  .max(10);
/** 외부 JSON을 검사하고 지도 좌표·경계를 한 형식으로 변환합니다. 공급자 원문은 클라이언트에 그대로 노출하지 않습니다. */
export function parseLocations(value: unknown): LocationResult[] {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success)
    throw new LocationError(
      502,
      "위치 검색 응답을 읽지 못했습니다. 잠시 뒤 다시 검색해 주세요.",
    );
  return parsed.data.map((r) => {
    const [s, n, w, e] = r.boundingbox;
    if (
      ![s, n, w, e].every(Number.isFinite) ||
      s > n ||
      w > e ||
      s < -85 ||
      n > 85 ||
      w < -180 ||
      e > 180
    )
      throw new LocationError(502, "위치 범위를 확인하지 못했습니다.");
    const geometry = boundarySchema.safeParse(r.geojson);
    return {
      id: String(r.place_id),
      name: r.display_name,
      latitude: r.lat,
      longitude: r.lon,
      bounds: [
        [s, w],
        [n, e],
      ],
      ...(geometry.success ? { boundary: geometry.data as Boundary } : {}),
    };
  });
}
/** 검색 버튼 또는 지역 선택 시만 호출합니다. 자동완성·일괄 주소 수집은 지원하지 않습니다.
 * @param query 사용자가 입력한 장소 또는 선택한 공식 지역명.
 * @param region true이면 지도용 행정경계도 요청합니다.
 * @throws {LocationError} 요청 과다·네트워크/서비스 오류·형식 오류. 자동 재시도하지 않습니다.
 */
export async function searchLocations(query: string, region = false) {
  const key = (region ? "region:" : "place:") + query.trim();
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.results;
  if (pending >= 8)
    throw new LocationError(
      429,
      "검색 요청이 많습니다. 잠시 뒤 다시 눌러 주세요.",
    );
  pending++;
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    // 1. 앱 전체에서 외부 요청을 직렬화해 초당 1회 이하로 제한합니다.
    const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const url = new URL(
      process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search",
    );
    url.search = new URLSearchParams({
      q: query,
      countrycodes: "kr",
      format: "jsonv2",
      limit: region ? "3" : "6",
      "accept-language": "ko",
      ...(region ? { polygon_geojson: "1", polygon_threshold: "0.001" } : {}),
    }).toString();
    // 2. 검색 문자열만 외부로 전달하며 사진·소유권 쿠키·API 키는 전달하지 않습니다.
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent":
            "SafeReport-Local/0.2 (https://github.com/vivian715037-maker/SafeReport)",
          "Accept-Language": "ko",
        },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new LocationError(
        503,
        "위치 검색에 연결하지 못했습니다. 지도에서 장소를 직접 선택할 수 있어요.",
      );
    }
    if (!response.ok)
      throw new LocationError(
        response.status === 429 ? 429 : 503,
        "위치 검색 서비스가 잠시 응답하지 않습니다. 잠시 뒤 다시 눌러 주세요.",
      );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new LocationError(502, "위치 검색 응답을 읽지 못했습니다.");
    }
    // 3. 같은 검색은 하루 동안 메모리에서 재사용합니다. 서비스 변경은 환경변수로 가능합니다.
    const results = parseLocations(data);
    cache.set(key, { expires: Date.now() + 86400000, results });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return results;
  } finally {
    pending--;
    release();
  }
}
