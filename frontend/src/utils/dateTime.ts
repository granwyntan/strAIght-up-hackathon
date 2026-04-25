function asDate(value: string | number | Date | null | undefined) {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return null;
}

function padSegment(value: number) {
  return value.toString().padStart(2, "0");
}

export function parseDisplayDate(value: string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return raw;
  }
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return "";
  }
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDisplayTime(value: string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  const shortMatch = raw.match(/^(\d{2}):(\d{2})$/);
  if (shortMatch) {
    const [, hh, mm] = shortMatch;
    return `${hh}:${mm}:00`;
  }
  const match = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return "";
  }
  const [, hh, mm, ss] = match;
  return `${hh}:${mm}:${ss || "00"}`;
}

export function formatDisplayDateTime(value: string | number | Date | null | undefined) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return `${padSegment(date.getDate())}/${padSegment(date.getMonth() + 1)}/${date.getFullYear()}, ${padSegment(date.getHours())}:${padSegment(date.getMinutes())}:${padSegment(date.getSeconds())}`;
}

export function formatDisplayTime(value: string | number | Date | null | undefined) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return `${padSegment(date.getHours())}:${padSegment(date.getMinutes())}:${padSegment(date.getSeconds())}`;
}

export function formatDisplayDate(value: string | number | Date | null | undefined) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return `${padSegment(date.getDate())}/${padSegment(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatInputDate(value: string | number | Date | null | undefined) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    const parsedDisplay = parseDisplayDate(typeof value === "string" ? value : "");
    return parsedDisplay || (typeof value === "string" ? value : "");
  }
  return `${date.getFullYear()}-${padSegment(date.getMonth() + 1)}-${padSegment(date.getDate())}`;
}

export function formatInputTime(value: string | number | Date | null | undefined) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    const parsed = parseDisplayTime(typeof value === "string" ? value : "");
    return parsed ? parsed.slice(0, 5) : (typeof value === "string" ? value.slice(0, 5) : "");
  }
  return `${padSegment(date.getHours())}:${padSegment(date.getMinutes())}`;
}

export function formatDisplayDateLabel(value: string | number | Date | null | undefined) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday}, ${formatDisplayDate(date)}`;
}

export function formatDisplayDateRange(start: string | number | Date | null | undefined, end: string | number | Date | null | undefined) {
  const left = formatDisplayDate(start);
  const right = formatDisplayDate(end);
  if (!left || !right) {
    return "";
  }
  return `${left} - ${right}`;
}

export function compactIsoId(value?: string | null) {
  const input = typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString();
  return input
    .split("-").join("")
    .split(":").join("")
    .split(".").join("")
    .split("T").join("")
    .split("Z").join("")
    .slice(0, 17);
}
