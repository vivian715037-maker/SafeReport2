"use client";
/** 장소 이름·주소를 검색 버튼으로만 조회합니다. 검색 문자열 외 사진·쿠키는 외부 서비스에 보내지 않습니다. */
import { useState } from "react";
import type { LocationResult } from "@/lib/location";
export default function LocationSearch({
  onSelect,
}: {
  onSelect: (result: LocationResult) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<LocationResult[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false);
  async function search() {
    setBusy(true);
    setError("");
    setSearched(false);
    setResults([]);
    try {
      const res = await fetch(
        "/api/locations?q=" + encodeURIComponent(query.trim()),
      );
      const data = await res.json() as LocationResult[] & {error?:string};
      if (!res.ok) throw Error(data.error);
      setResults(data);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "장소를 검색하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sr-search" aria-label="장소 검색">
      <label htmlFor="place-search">장소 이름이나 주소로 찾기</label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) void search();
        }}
      >
        <input
          id="place-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={120}
          placeholder="예: 강릉역, 서울시청"
        />
        <button
          className="sr-secondary"
          disabled={busy || query.trim().length < 2}
        >
          {busy ? "찾는 중…" : "검색"}
        </button>
      </form>
      <p className="sr-small">
        검색 버튼을 누르면 입력한 장소를 외부 위치 검색 서비스로 보냅니다. 위치
        검색:{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          © OpenStreetMap
        </a>
      </p>
      {error && (
        <p role="alert" className="sr-error-text">
          {error}
        </p>
      )}
      {searched && !results.length && (
        <p role="status">
          검색 결과가 없습니다. 다른 이름으로 검색하거나 지도에서 선택해 주세요.
        </p>
      )}
      {results.length > 0 && (
        <ul className="sr-search-results" aria-label="검색 결과">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(result);
                  setResults([]);
                  setSearched(false);
                  setQuery(result.name);
                }}
              >
                <span aria-hidden="true">⌖</span>
                <span>{result.name}</span>
                <strong>선택</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
