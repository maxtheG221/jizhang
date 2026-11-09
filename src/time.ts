const MONTHS = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

export function parisToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function parisMonth(now = new Date()): string {
  return parisToday(now).slice(0, 7);
}

export function shiftMonth(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  if (!year || !month) return ym;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function isRealDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function monthLabel(ym: string): { month: string; year: string } {
  const [year, month] = ym.split("-").map(Number);
  return { month: MONTHS[(month ?? 1) - 1] ?? ym, year: String(year ?? "") };
}

export function dayLabel(iso: string, todayIso: string): { date: string; week: string; tag: string | null } {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12));
  const week = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Europe/Paris",
    weekday: "short",
  }).format(date);
  let tag: string | null = null;
  if (iso === todayIso) tag = "今天";
  else if (iso === shiftISO(todayIso, -1)) tag = "昨天";
  return { date: `${month}月${day}日`, week, tag };
}

export function formatStamp(ms: number): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}
