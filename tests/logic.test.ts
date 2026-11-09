import { describe, expect, it } from "vitest";
import { buildBackup, buildCsv, isBackupStale, mergeSnapshots, shouldWarnBackup, snapshotFromBackup, validateBackup } from "../src/backup";
import { addCategory, applyDeleteCategory, defaultCategories, planDeleteCategory } from "../src/categories";
import { formatEUR, parseAmountToCents, sharePercents } from "../src/money";
import { parisToday, shiftMonth } from "../src/time";
import type { Snapshot, Transaction } from "../src/types";

function txn(partial: Partial<Transaction> & Pick<Transaction, "id" | "categoryId" | "kind" | "amountCents" | "date">): Transaction {
  return {
    note: "",
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function baseSnapshot(): Snapshot {
  return {
    categories: defaultCategories(),
    transactions: [
      txn({ id: "a", kind: "expense", categoryId: "exp-0", amountCents: 1250, date: "2026-11-09", note: "咖啡" }),
      txn({ id: "b", kind: "income", categoryId: "inc-0", amountCents: 80000, date: "2026-11-01", note: "生活費" }),
    ],
    budgets: { "2026-11": 90000 },
    defaultBudgetCents: 90000,
    lastExportAt: 1,
  };
}

describe("money", () => {
  it("formats euros with a grouped comma decimal", () => {
    expect(formatEUR(0)).toBe("€0,00");
    expect(formatEUR(1250)).toBe("€12,50");
    expect(formatEUR(123456)).toBe(`€1\u00A0234,56`);
    expect(formatEUR(-50)).toBe("−€0,50");
  });

  it("parses French and international amounts", () => {
    expect(parseAmountToCents("12,50")).toBe(1250);
    expect(parseAmountToCents("12.5")).toBe(1250);
    expect(parseAmountToCents("12")).toBe(1200);
    expect(parseAmountToCents("€1 234,56")).toBe(123456);
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents(",5")).toBe(50);
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("12,345")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("rounds shares to 100", () => {
    expect(sharePercents([50, 50])).toEqual([50, 50]);
    const parts = sharePercents([1, 1, 1]);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});

describe("Europe/Paris dates", () => {
  it("uses the Paris calendar around midnight", () => {
    expect(parisToday(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
    expect(parisToday(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
    expect(parisToday(new Date("2026-11-09T22:30:00Z"))).toBe("2026-11-09");
    expect(parisToday(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
  });

  it("shifts months across the year boundary", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("backup", () => {
  it("round-trips through JSON", () => {
    const backup = buildBackup(baseSnapshot(), 1_700_000_000_000);
    const parsed = validateBackup(JSON.parse(JSON.stringify(backup)) as unknown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(snapshotFromBackup(parsed.backup).transactions).toEqual(baseSnapshot().transactions);
    expect(parsed.backup.lastExportAt).toBe(1_700_000_000_000);
  });

  it("rejects a foreign file", () => {
    expect(validateBackup({ hello: "world" }).ok).toBe(false);
  });

  it("merges without duplicating and replace drops local-only rows", () => {
    const local = baseSnapshot();
    local.transactions.push(txn({ id: "local", kind: "expense", categoryId: "exp-1", amountCents: 300, date: "2026-11-02" }));
    const incoming = buildBackup(baseSnapshot(), 50);
    const merged = mergeSnapshots(local, incoming);
    expect(merged.added).toBe(0);
    expect(merged.snapshot.transactions.some((item) => item.id === "local")).toBe(true);

    const extra = buildBackup(baseSnapshot(), 50);
    extra.transactions.push(txn({ id: "remote", kind: "expense", categoryId: "exp-2", amountCents: 215, date: "2026-11-03", note: "地鐵" }));
    const withRemote = mergeSnapshots(local, extra);
    expect(withRemote.added).toBe(1);
    expect(withRemote.snapshot.transactions.some((item) => item.id === "remote")).toBe(true);
    expect(withRemote.snapshot.transactions.some((item) => item.id === "local")).toBe(true);

    const replaced = snapshotFromBackup(extra);
    expect(replaced.transactions.some((item) => item.id === "local")).toBe(false);
    expect(replaced.transactions.some((item) => item.id === "remote")).toBe(true);
  });

  it("round-trips a phone backup through replace", () => {
    const original = baseSnapshot();
    const file = JSON.parse(JSON.stringify(buildBackup(original, 1_700_000_000_000))) as unknown;
    const parsed = validateBackup(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = snapshotFromBackup(parsed.backup);
    expect(restored.transactions).toEqual(original.transactions);
    expect(restored.categories.map((category) => [category.id, category.name, category.kind, Boolean(category.locked)])).toEqual(
      original.categories.map((category) => [category.id, category.name, category.kind, Boolean(category.locked)]),
    );
    expect(restored.budgets).toEqual(original.budgets);
    expect(restored.defaultBudgetCents).toBe(original.defaultBudgetCents);
    expect(restored.lastExportAt).toBe(1_700_000_000_000);
  });

  it("warns when the last backup is missing or older than seven days", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    expect(isBackupStale(null, now)).toBe(true);
    expect(isBackupStale(now - 6 * day, now)).toBe(false);
    expect(isBackupStale(now - 8 * day, now)).toBe(true);
    expect(shouldWarnBackup(0, null, now)).toBe(false);
    expect(shouldWarnBackup(3, null, now)).toBe(true);
    expect(shouldWarnBackup(3, now - 2 * day, now)).toBe(false);
    expect(shouldWarnBackup(3, now - 8 * day, now)).toBe(true);
  });

  it("writes a spreadsheet-friendly CSV", () => {
    const csv = buildCsv(baseSnapshot());
    expect(csv.startsWith("\uFEFF日期;類型;分類;金額;備註")).toBe(true);
    expect(csv).toContain("2026-11-09;支出;餐飲;12,50;咖啡");
  });
});

describe("categories", () => {
  it("moves entries to the fallback category after deletion", () => {
    const categories = defaultCategories();
    const transactions = [txn({ id: "a", kind: "expense", categoryId: "exp-0", amountCents: 100, date: "2026-11-01" })];
    const plan = planDeleteCategory(categories, transactions, "exp-0");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.count).toBe(1);
    expect(plan.fallback.name).toBe("其他");
    const next = applyDeleteCategory(categories, transactions, "exp-0", plan.fallback.id, 5);
    expect(next.transactions[0]?.categoryId).toBe("exp-9");
    expect(next.categories.some((category) => category.id === "exp-0")).toBe(false);
    expect(planDeleteCategory(categories, transactions, "exp-9").ok).toBe(false);
  });

  it("rejects a duplicate name and keeps 其他 last", () => {
    const added = addCategory(defaultCategories(), "expense", "訂閱");
    expect(added.error).toBeUndefined();
    const names = added.categories.filter((category) => category.kind === "expense").sort((a, b) => a.sort - b.sort);
    expect(names.at(-1)?.name).toBe("其他");
    expect(names.some((category) => category.name === "訂閱")).toBe(true);
    expect(addCategory(added.categories, "expense", "訂閱").error).toBe("dup");
  });
});
