/**
 * 날짜 표시. 서버(NAS 컨테이너)와 PC 의 시간대가 달라도 같은 값이 보이도록
 * 항상 한국 시간으로 계산한다.
 */
const KST = "Asia/Seoul";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function pick(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** 목록용 — 올해면 `MM-DD`, 지난해 글이면 `YY-MM-DD` */
export function formatListDate(value: Date, now: Date = new Date()): string {
  const p = dateFormatter.formatToParts(value);
  const year = pick(p, "year");
  const month = pick(p, "month");
  const day = pick(p, "day");

  const thisYear = pick(dateFormatter.formatToParts(now), "year");
  if (year === thisYear) return `${month}-${day}`;
  return `${year.slice(2)}-${month}-${day}`;
}

/** 상세용 — `2026-10-08 14:32` */
export function formatDateTime(value: Date): string {
  const p = dateTimeFormatter.formatToParts(value);
  return `${pick(p, "year")}-${pick(p, "month")}-${pick(p, "day")} ${pick(p, "hour")}:${pick(p, "minute")}`;
}
