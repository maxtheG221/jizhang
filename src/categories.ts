import type { Category, Kind, Transaction } from "./types";

const EXPENSE_NAMES = ["餐飲", "超市", "交通", "住宿", "學業", "健身", "服裝", "交易/投資", "娛樂", "其他"];
const INCOME_NAMES = ["收入", "其他收入"];

export function defaultCategories(): Category[] {
  const expenses = EXPENSE_NAMES.map((name, index) => ({
    id: `exp-${index}`,
    kind: "expense" as const,
    name,
    sort: index,
    locked: name === "其他",
  }));
  const income = INCOME_NAMES.map((name, index) => ({
    id: `inc-${index}`,
    kind: "income" as const,
    name,
    sort: index,
    locked: name === "其他收入",
  }));
  return [...expenses, ...income];
}

export function categoriesOf(categories: Category[], kind: Kind): Category[] {
  return categories.filter((category) => category.kind === kind).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-Hant"));
}

export function fallbackCategory(categories: Category[], kind: Kind): Category | undefined {
  return categoriesOf(categories, kind).find((category) => category.locked);
}

export type AddResult = { categories: Category[]; id?: string; error?: "empty" | "long" | "dup" };

export function addCategory(categories: Category[], kind: Kind, name: string): AddResult {
  const trimmed = name.trim();
  if (!trimmed) return { categories, error: "empty" };
  if (trimmed.length > 16) return { categories, error: "long" };
  if (categories.some((category) => category.kind === kind && category.name === trimmed)) {
    return { categories, error: "dup" };
  }
  const unlocked = categories.filter((category) => category.kind === kind && !category.locked);
  const sort = unlocked.reduce((max, category) => Math.max(max, category.sort), -1) + 1;
  const next = categories.map((category) =>
    category.kind === kind && category.locked ? { ...category, sort: Math.max(category.sort, sort + 1) } : category,
  );
  const id = crypto.randomUUID();
  next.push({ id, kind, name: trimmed, sort });
  return { categories: next, id };
}

export function renameCategory(categories: Category[], id: string, name: string): { categories: Category[]; error?: "missing" | "empty" | "long" | "dup" } {
  const current = categories.find((category) => category.id === id);
  if (!current) return { categories, error: "missing" };
  const trimmed = name.trim();
  if (!trimmed) return { categories, error: "empty" };
  if (trimmed.length > 16) return { categories, error: "long" };
  if (categories.some((category) => category.kind === current.kind && category.id !== id && category.name === trimmed)) {
    return { categories, error: "dup" };
  }
  if (trimmed === current.name) return { categories };
  return {
    categories: categories.map((category) => (category.id === id ? { ...category, name: trimmed } : category)),
  };
}

export type DeletePlan =
  | { ok: false; message: string }
  | { ok: true; count: number; fallback: Category; name: string };

export function planDeleteCategory(categories: Category[], transactions: Transaction[], id: string): DeletePlan {
  const category = categories.find((item) => item.id === id);
  if (!category) return { ok: false, message: "找不到這個分類。" };
  if (category.locked) return { ok: false, message: "這個分類用來承接其他紀錄，不能刪除。" };
  const fallback = fallbackCategory(categories, category.kind);
  if (!fallback) return { ok: false, message: "找不到可以承接紀錄的分類。" };
  const count = transactions.filter((transaction) => transaction.categoryId === id).length;
  return { ok: true, count, fallback, name: category.name };
}

export function applyDeleteCategory(
  categories: Category[],
  transactions: Transaction[],
  id: string,
  fallbackId: string,
  now: number,
): { categories: Category[]; transactions: Transaction[] } {
  return {
    categories: categories.filter((category) => category.id !== id),
    transactions: transactions.map((transaction) =>
      transaction.categoryId === id ? { ...transaction, categoryId: fallbackId, updatedAt: now } : transaction,
    ),
  };
}
