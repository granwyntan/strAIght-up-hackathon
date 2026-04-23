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
