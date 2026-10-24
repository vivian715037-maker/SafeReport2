/** 수동 장소 검색과 선택한 시·군·구 지도 조회. 지역 코드는 저장소의 공식 목록으로 검증합니다. */
import { NextResponse } from "next/server";
import regions from "@/data/regions.json";
import { LocationError, searchLocations } from "@/lib/geocoding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("region");
    if (code) {
      const province = regions.provinces.find((p) =>
        p.cities.some((c) => c.code === code),
      );
      const city = province?.cities.find((c) => c.code === code);
      if (!province || !city)
        throw new LocationError(400, "시·도와 시·군·구를 다시 선택해 주세요.");
      const found = await searchLocations(
        `${province.name} ${city.name}`,
        true,
      );
      if (!found.length)
        throw new LocationError(
          404,
          "이 지역 지도를 찾지 못했습니다. 다른 지역을 선택하거나 잠시 뒤 다시 시도해 주세요.",
        );
      return NextResponse.json(
        { ...found[0], name: `${province.name} ${city.name}` },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const query = url.searchParams.get("q")?.trim() || "";
    if (query.length < 2 || query.length > 120)
      throw new LocationError(
        400,
        "장소 이름이나 주소를 2~120자로 입력해 주세요.",
      );
    return NextResponse.json(await searchLocations(query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof LocationError
            ? error.message
            : "위치를 검색하지 못했습니다.",
      },
      { status: error instanceof LocationError ? error.status : 500 },
    );
  }
}
