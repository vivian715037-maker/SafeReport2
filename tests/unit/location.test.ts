/** 장소 검색 응답·시군구 경계·구멍 영역·잘못된 지역 입력을 검사합니다. 실제 외부 검색은 하지 않습니다. */
import { describe, it, expect } from "vitest";
import { inRegion, type LocationResult } from "../../src/lib/location";
import { parseLocations } from "../../src/lib/geocoding";
import regions from "../../src/data/regions.json";
const region: LocationResult = {
  id: "test",
  name: "가상 지역",
  latitude: 1,
  longitude: 1,
  bounds: [
    [0, 0],
    [10, 10],
  ],
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [3, 3],
        [5, 3],
        [5, 5],
        [3, 5],
        [3, 3],
      ],
    ],
  },
};
describe("지역 선택과 장소 검색", () => {
  it("선택한 경계 밖과 내부 구멍의 제보를 제외한다", () => {
    expect(inRegion({ latitude: 1, longitude: 1 }, region)).toBe(true);
    expect(inRegion({ latitude: 4, longitude: 4 }, region)).toBe(false);
    expect(inRegion({ latitude: 11, longitude: 1 }, region)).toBe(false);
    expect(inRegion({ latitude: null, longitude: null }, region)).toBe(false);
  });
  it("섬으로 나뉜 MultiPolygon과 경계 없는 지도 범위를 지원한다", () => {
    const multi: LocationResult = {
      ...region,
      boundary: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          [
            [
              [8, 8],
              [10, 8],
              [10, 10],
              [8, 10],
              [8, 8],
            ],
          ],
        ],
      },
    };
    expect(inRegion({ latitude: 9, longitude: 9 }, multi)).toBe(true);
    expect(inRegion({ latitude: 5, longitude: 5 }, multi)).toBe(false);
    expect(
      inRegion(
        { latitude: 5, longitude: 5 },
        { ...region, boundary: undefined },
      ),
    ).toBe(true);
  });
  it("공급자 좌표를 변환하고 잘못된 좌표 응답은 거부한다", () => {
    const valid = {
      place_id: 123,
      display_name: "서울시청",
      lat: "37.5665",
      lon: "126.978",
      boundingbox: ["37.56", "37.57", "126.97", "126.98"],
    };
    expect(parseLocations([valid])[0].bounds).toEqual([
      [37.56, 126.97],
      [37.57, 126.98],
    ]);
    expect(() => parseLocations([{ ...valid, lat: "NaN" }])).toThrow();
    expect(() =>
      parseLocations([{ ...valid, boundingbox: ["38", "37", "126", "127"] }]),
    ).toThrow();
  });
  it("공식 목록의 각 시도에 선택 가능한 지역이 있고 지역 코드는 중복되지 않는다", () => {
    const codes = regions.provinces.flatMap((p) => p.cities.map((c) => c.code));
    expect(regions.provinces.every((p) => p.cities.length > 0)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(
      regions.provinces.some(
        (p) =>
          p.name === "강원특별자치도" &&
          p.cities.some((c) => c.name === "강릉시"),
      ),
    ).toBe(true);
  });
});
