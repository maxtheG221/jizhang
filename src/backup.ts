import type { Backup, Category, Kind, Snapshot, Transaction } from "./types";
import { isRealDate } from "./time";

export type ValidateResult = { ok: true; backup: Backup } | { ok: false; message: string };

const DATE_KEY = /^\d{4}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asKind(value: unknown): Kind | null {
  return value === "expense" || value === "income" ? value : null;
}

function cleanCategory(value: unknown): Category | null {
  if (!isRecord(value)) return null;
  const kind = asKind(value.kind);
  if (!kind) return null;
  if (typeof value.id !== "string" || !value.id || value.id.length > 80) return null;
  if (typeof value.name !== "string") return null;
  const name = value.name.trim();
  if (!name || name.length > 16) return null;
  if (typeof value.sort !== "number" || !Number.isFinite(value.sort)) return null;
  const category: Category = { id: value.id, kind, name, sort: value.sort };
  if (value.locked === true) category.locked = true;
  return category;
}

function cleanTransaction(value: unknown): Transaction | null {
  if (!isRecord(value)) return null;
  const kind = asKind(value.kind);
  if (!kind) return null;
  if (typeof value.id !== "string" || !value.id || value.id.length > 80) return null;
  if (typeof value.categoryId !== "string" || !value.categoryId) return null;
  if (typeof value.amountCents !== "number" || !Number.isInteger(value.amountCents) || value.amountCents <= 0 || value.amountCents > 100_000_000_00) {
    return null;
  }
  if (typeof value.note !== "string" || value.note.length > 80) return null;
  if (typeof value.date !== "string" || !isRealDate(value.date)) return null;
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return null;
  if (typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)) return null;
  return {
    id: value.id,
    kind,
    amountCents: value.amountCents,
    categoryId: value.categoryId,
    note: value.note,
    date: value.date,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function validateBackup(input: unknown): ValidateResult {
  if (!isRecord(input)) return { ok: false, message: "這份檔案不是記帳的備份。" };
  if (input.app !== "記帳" || input.version !== 1) return { ok: false, message: "這份檔案不是記帳的備份。" };
  if (typeof input.exportedAt !== "string") return { ok: false, message: "備份內容不完整。" };
  if (!Array.isArray(input.categories) || !Array.isArray(input.transactions)) {
    return { ok: false, message: "備份內容不完整。" };
  }

  const categories: Category[] = [];
  const categoryIds = new Set<string>();
  for (const item of input.categories) {
    const category = cleanCategory(item);
    if (!category) return { ok: false, message: "備份裡有一個分類無法讀取。" };
    if (categoryIds.has(category.id)) return { ok: false, message: "備份裡有重複的分類。" };
    categoryIds.add(category.id);
    categories.push(category);
  }

  const lockedExpense = categories.some((category) => category.kind === "expense" && category.locked);
  const lockedIncome = categories.some((category) => category.kind === "income" && category.locked);
  if (!lockedExpense || !lockedIncome) return { ok: false, message: "備份缺少用來承接紀錄的預設分類。" };

  const transactions: Transaction[] = [];
  const transactionIds = new Set<string>();
  for (const item of input.transactions) {
    const transaction = cleanTransaction(item);
    if (!transaction) return { ok: false, message: "備份裡有一筆紀錄無法讀取。" };
    if (transactionIds.has(transaction.id)) return { ok: false, message: "備份裡有重複的紀錄。" };
    const category = categories.find((entry) => entry.id === transaction.categoryId);
    if (!category || category.kind !== transaction.kind) return { ok: false, message: "有紀錄指向不存在的分類。" };
    transactionIds.add(transaction.id);
    transactions.push(transaction);
  }

  if (!isRecord(input.budgets)) return { ok: false, message: "備份內容不完整。" };
  const budgets: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.budgets)) {
    if (!DATE_KEY.test(key)) return { ok: false, message: "備份裡的預算月份不正確。" };
    const month = Number(key.slice(5));
    if (month < 1 || month > 12) return { ok: false, message: "備份裡的預算月份不正確。" };
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 100_000_000_00) {
      return { ok: false, message: "備份裡的預算金額不正確。" };
    }
    budgets[key] = value;
  }

  let defaultBudgetCents: number | null = null;
  if (input.defaultBudgetCents !== null && input.defaultBudgetCents !== undefined) {
    if (typeof input.defaultBudgetCents !== "number" || !Number.isInteger(input.defaultBudgetCents) || input.defaultBudgetCents <= 0) {
      return { ok: false, message: "備份裡的預算金額不正確。" };
    }
    defaultBudgetCents = input.defaultBudgetCents;
  }

  let lastExportAt: number | null = null;
  if (input.lastExportAt !== null && input.lastExportAt !== undefined) {
    if (typeof input.lastExportAt !== "number" || !Number.isFinite(input.lastExportAt)) {
      return { ok: false, message: "備份內容不完整。" };
    }
    lastExportAt = input.lastExportAt;
  }

  return {
    ok: true,
    backup: {
      app: "記帳",
      version: 1,
      exportedAt: input.exportedAt,
      categories,
      transactions,
      budgets,
      defaultBudgetCents,
      lastExportAt,
    },
  };
}

export const BACKUP_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isBackupStale(lastBackupAt: number | null, now = Date.now()): boolean {
  if (lastBackupAt == null) return true;
  return now - lastBackupAt > BACKUP_STALE_MS;
}

export function shouldWarnBackup(transactionCount: number, lastBackupAt: number | null, now = Date.now()): boolean {
  return transactionCount > 0 && isBackupStale(lastBackupAt, now);
}

export function buildBackup(snapshot: Snapshot, exportedAtMs: number): Backup {
  return {
    app: "記帳",
    version: 1,
    exportedAt: new Date(exportedAtMs).toISOString(),
    categories: snapshot.categories,
    transactions: snapshot.transactions,
    budgets: snapshot.budgets,
    defaultBudgetCents: snapshot.defaultBudgetCents,
    lastExportAt: exportedAtMs,
  };
}

export function snapshotFromBackup(backup: Backup): Snapshot {
  return {
    categories: backup.categories,
    transactions: backup.transactions,
    budgets: backup.budgets,
    defaultBudgetCents: backup.defaultBudgetCents,
    lastExportAt: backup.lastExportAt,
  };
}

export function mergeSnapshots(local: Snapshot, incoming: Backup): { snapshot: Snapshot; added: number } {
  const categories = [...local.categories];
  const categoryIds = new Set(categories.map((category) => category.id));
  for (const category of incoming.categories) {
    if (!categoryIds.has(category.id)) {
      categories.push(category);
      categoryIds.add(category.id);
    }
  }
  const transactions = [...local.transactions];
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  let added = 0;
  for (const transaction of incoming.transactions) {
    if (transactionIds.has(transaction.id)) continue;
    const category = categories.find((item) => item.id === transaction.categoryId);
    if (category && category.kind === transaction.kind) {
      transactions.push(transaction);
    } else {
      const fallback = categories.find((item) => item.locked && item.kind === transaction.kind);
      if (!fallback) continue;
      transactions.push({ ...transaction, categoryId: fallback.id });
    }
    transactionIds.add(transaction.id);
    added += 1;
  }
  const budgets = { ...incoming.budgets, ...local.budgets };
  const lastExportAt = Math.max(local.lastExportAt ?? 0, incoming.lastExportAt ?? 0) || null;
  return {
    snapshot: {
      categories,
      transactions,
      budgets,
      defaultBudgetCents: local.defaultBudgetCents ?? incoming.defaultBudgetCents,
      lastExportAt,
    },
    added,
  };
}

function csvCell(value: string): string {
  let cell = value.replace(/"/g, '""');
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  if (/[;"\n\r]/.test(cell)) return `"${cell}"`;
  return cell;
}

export function buildCsv(snapshot: Snapshot): string {
  const names = new Map(snapshot.categories.map((category) => [category.id, category.name]));
  const rows = [...snapshot.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const lines = ["日期;類型;分類;金額;備註"];
  for (const transaction of rows) {
    const amount = `${Math.floor(transaction.amountCents / 100)},${String(transaction.amountCents % 100).padStart(2, "0")}`;
    lines.push(
      [
        transaction.date,
        transaction.kind === "expense" ? "支出" : "收入",
        csvCell(names.get(transaction.categoryId) ?? ""),
        amount,
        csvCell(transaction.note),
      ].join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
