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

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function isValidDateParts(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) {
    return false;
  }
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

function isValidTimeParts(hours: number, minutes: number, seconds: number) {
  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    Number.isInteger(seconds) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59 &&
    seconds >= 0 &&
    seconds <= 59
  );
}

export function parseDisplayDate(value: string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return isValidDateParts(Number(dd), Number(mm), Number(yyyy)) ? raw : "";
  }
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return "";
  }
  const [, dd, mm, yyyy] = match;
  if (!isValidDateParts(Number(dd), Number(mm), Number(yyyy))) {
    return "";
  }
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDisplayTime(value: string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  const shortMatch = raw.match(/^(\d{2}):(\d{2})$/);
  if (shortMatch) {
    const [, hh, mm] = shortMatch;
    return isValidTimeParts(Number(hh), Number(mm), 0) ? `${hh}:${mm}:00` : "";
  }
  const match = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return "";
  }
  const [, hh, mm, ss] = match;
  const normalizedSeconds = ss || "00";
  return isValidTimeParts(Number(hh), Number(mm), Number(normalizedSeconds)) ? `${hh}:${mm}:${normalizedSeconds}` : "";
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
    return parsed || (typeof value === "string" ? value : "");
  }
  return `${padSegment(date.getHours())}:${padSegment(date.getMinutes())}:${padSegment(date.getSeconds())}`;
}

export function maskDisplayDateInput(value: string | null | undefined) {
  const digits = digitsOnly(typeof value === "string" ? value : "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function maskDisplayTimeInput(value: string | null | undefined) {
  const digits = digitsOnly(typeof value === "string" ? value : "").slice(0, 6);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
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
