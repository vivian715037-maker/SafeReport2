/** 검색 결과와 지도 범위의 공통 형식. 공개 좌표가 선택한 지역 안에 있는지 브라우저에서도 검사합니다. */
export type Boundary =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
export type LocationResult = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  bounds: [[number, number], [number, number]];
  boundary?: Boundary;
};
/** 점이 닫힌 다각형 안에 있는지 교차 횟수로 판정합니다. 좌표 순서는 [경도,위도]입니다. */
function inRing(lon: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [px, py] = ring[j];
    if (y > lat !== py > lat && lon < ((px - x) * (lat - y)) / (py - y) + x)
      inside = !inside;
  }
  return inside;
}
/** 바깥 경계에 포함되고 구멍 영역에서는 제외되는지 확인합니다. */
function inPolygon(lon: number, lat: number, rings: number[][][]) {
  return (
    rings.length > 0 &&
    inRing(lon, lat, rings[0]) &&
    !rings.slice(1).some((r) => inRing(lon, lat, r))
  );
}
/** 지역 경계가 있으면 다각형, 없으면 검색 서비스의 지도 범위를 사용합니다. 미지정 좌표는 표시하지 않습니다. */
export function inRegion(
  point: { latitude?: number | null; longitude?: number | null },
  region: LocationResult,
) {
  const { latitude: lat, longitude: lon } = point;
  if (lat == null || lon == null) return false;
  const [[s, w], [n, e]] = region.bounds;
  if (lat < s || lat > n || lon < w || lon > e) return false;
  if (!region.boundary) return true;
  return region.boundary.type === "Polygon"
    ? inPolygon(lon, lat, region.boundary.coordinates)
    : region.boundary.coordinates.some((p) => inPolygon(lon, lat, p));
}
