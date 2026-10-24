"use client";
/** Leaflet 지도. 편집 모드에서는 클릭·핀 드래그로 좌표를 전달하고 공개 모드에서는 근접 핀을 묶습니다. */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { labels } from "@/lib/rules";
import { riskLabels, riskColors, groupRisk } from "@/lib/risk";
type Point = {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  title: string;
  status: string;
  riskLevel?: string;
  riskReason?: string;
  riskAssessedAt?: string | null;
};
const emptyPoints: Point[] = [];
/** 외부 지도가 실패해도 상위 화면의 숫자 좌표 입력과 제보 목록을 유지합니다. */
export default function Map({
  lat,
  lon,
  onPick,
  points = emptyPoints,
  onSelect,
  riskMode = false,
  bounds,
  preserveView = false,
}: {
  lat?: number | null;
  lon?: number | null;
  onPick?: (lat: number, lon: number) => void;
  points?: Point[];
  onSelect?: (id: string) => void;
  riskMode?: boolean;
  bounds?: [[number, number], [number, number]];
  preserveView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fittedBounds = useRef<string | null>(null);
  const handlers = useRef({ onPick, onSelect });
  handlers.current = { onPick, onSelect };
  useEffect(() => {
    if (!ref.current) return;
    // 1. 타일은 보이는 영역만 요청하고 OpenStreetMap 출처를 유지합니다.
    const map = L.map(ref.current, {
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView([lat ?? 37.5665, lon ?? 126.978], 15);
    mapRef.current = map;
    fittedBounds.current = null;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    ).addTo(map);
    tiles.on("tileerror", () => {
      if (ref.current) ref.current.setAttribute("data-tile-error", "true");
    });
    if (onPick)
      map.on("click", (e) =>
        handlers.current.onPick?.(e.latlng.lat, e.latlng.lng),
      );
    return () => {
      map.stop();
      map.remove();
      mapRef.current = null;
    };
    // 지도 인스턴스는 마운트당 한 번 생성하며 좌표 변경은 아래 효과에서 처리합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const icon = (label: string, color = "#2563eb") =>
      L.divIcon({
        className: "map-marker",
        html: `<span style="background:${color}">${label}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
    // 2. 편집 좌표는 드래그할 수 있게 표시합니다.
    if (onPick && lat != null && lon != null) {
      L.marker([lat, lon], { icon: icon("+"), draggable: true })
        .on("dragend", (e) => {
          const p = e.target.getLatLng();
          handlers.current.onPick?.(p.lat, p.lng);
        })
        .addTo(layer);
      map.panTo([lat, lon], { animate: false });
    }
    // 3. 공개 핀은 약 60m 이내 묶고 팝업에서 개별 제보로 이동합니다.
    const groups: Point[][] = [];
    for (const p of points) {
      if (p.latitude == null || p.longitude == null) continue;
      const group = groups.find(
        (g) =>
          map.distance(
            [p.latitude!, p.longitude!],
            [g[0].latitude!, g[0].longitude!],
          ) < 60,
      );
      if (group) group.push(p);
      else groups.push([p]);
    }
    for (const group of groups) {
      const p = group[0];
      const div = document.createElement("div");
      for (const item of group) {
        const button = document.createElement("button");
        button.textContent = `${item.title} · ${labels[item.status]}${riskMode ? " · AI 추정 " + riskLabels[item.riskLevel || "UNKNOWN"] : ""}`;
        button.onclick = () => handlers.current.onSelect?.(item.id);
        div.append(button, document.createElement("br"));
        if (riskMode) {
          const reason = document.createElement("small");
          reason.textContent = item.riskReason || "아직 AI 평가가 없습니다.";
          div.append(reason, document.createElement("br"));
        }
      }
      L.marker([p.latitude!, p.longitude!], {
        icon: icon(
          String(group.length),
          riskMode
            ? riskColors[groupRisk(group.map((x) => x.riskLevel || "UNKNOWN"))]
            : "#2563eb",
        ),
      })
        .bindPopup(div)
        .addTo(layer);
    }
    const fit = () => {
      map.invalidateSize({ animate: false, pan: false });
      if (bounds) {
        // 같은 크기에서 데이터만 갱신되면 탐색 위치를 유지하고, 화면 폭이 바뀌면 전국 범위를 다시 맞춥니다.
        const signature = JSON.stringify([
          bounds,
          ref.current?.clientWidth,
          ref.current?.clientHeight,
        ]);
        if (preserveView && fittedBounds.current === signature) return;
        map.fitBounds(bounds, {
          padding: [20, 20],
          maxZoom: 14,
          animate: false,
        });
        fittedBounds.current = signature;
      } else if (!onPick && groups.length)
        map.fitBounds(
          L.latLngBounds(
            groups.map(
              (g) => [g[0].latitude!, g[0].longitude!] as [number, number],
            ),
          ),
          { maxZoom: 16, padding: [35, 35], animate: false },
        );
    };
    fit();
    // 화면 회전·폭 변경 후에도 멀리 떨어진 핀이 화면 밖으로 밀리지 않게 범위를 다시 맞춥니다.
    const resize = new ResizeObserver(fit);
    if (ref.current) resize.observe(ref.current);
    return () => {
      resize.disconnect();
      layer.remove();
    };
  }, [lat, lon, onPick, points, riskMode, bounds, preserveView]);
  return (
    <>
      <div className="map" ref={ref} aria-label="제보 위치 지도" />
      <p className="map-help">
        {onPick
          ? "지도 클릭 또는 핀 이동으로 위치 선택 · 지도가 표시되지 않으면 아래 좌표를 직접 입력하세요."
          : "공개 위치는 약 50m 단위로 조정됩니다. 핀을 누르면 제보와 상태를 확인할 수 있으며 지도 장애 시 아래 목록을 이용하세요."}
      </p>
    </>
  );
}
