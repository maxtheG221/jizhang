const GROUP = "\u00A0";

export function formatEUR(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  const body = `€${grouped},${frac}`;
  return neg ? `−${body}` : body;
}

export function formatInputFromCents(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const euros = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${euros},${frac}`;
}

export function parseAmountToCents(raw: string): number | null {
  let s = raw.trim().replace(/[€\s\u00a0\u202f]/g, "").replace(/[−–—-]/g, "");
  if (!s) return null;
  s = s.replace(/，/g, ",").replace(/．/g, ".");
  const commas = s.split(",").length - 1;
  const dots = s.split(".").length - 1;
  if (commas > 1 || dots > 1) return null;
  if (commas === 1 && dots === 1) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(".", "").replace(",", ".");
    else s = s.replace(",", "");
  } else if (commas === 1) {
    s = s.replace(",", ".");
  }
  if (s.startsWith(".")) s = `0${s}`;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (!whole || whole.length > 8) return null;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Largest-remainder rounding so parts sum to 100. */
export function sharePercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * 100);
  const floors = raw.map((value) => Math.floor(value));
  let remain = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; i < order.length && remain > 0; i += 1) {
    floors[order[i]!.index] += 1;
    remain -= 1;
  }
  return floors;
}
