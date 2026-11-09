import { buildBackup, buildCsv, mergeSnapshots, snapshotFromBackup, validateBackup } from "./backup";
import { addCategory, applyDeleteCategory, categoriesOf, planDeleteCategory, renameCategory } from "./categories";
import { persist } from "./db";
import { formatInputFromCents, parseAmountToCents } from "./money";
import { render, resizeAmount } from "./render";
import { state } from "./state";
import type { Kind, Snapshot } from "./types";
import { isRealDate, parisMonth, parisToday, shiftMonth } from "./time";

const nameError = {
  empty: "請輸入分類名稱。",
  long: "分類名稱請在 16 個字以內。",
  dup: "已經有相同的分類名稱。",
  missing: "找不到這個分類。",
} as const;

let writing = false;

function data(): Snapshot {
  return {
    categories: state.categories,
    transactions: state.transactions,
    budgets: state.budgets,
    defaultBudgetCents: state.defaultBudgetCents,
    lastExportAt: state.lastExportAt,
  };
}

async function commit(): Promise<void> {
  try {
    await persist(data());
  } catch {
    state.dialog = {
      type: "alert",
      title: "無法儲存",
      text: "這台裝置拒絕寫入資料。請先匯出備份，並確認瀏覽器沒有封鎖儲存空間。",
    };
    render();
  }
}

function recentCategory(kind: Kind): string {
  const recent = state.transactions
    .filter((transaction) => transaction.kind === kind)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (recent && state.categories.some((category) => category.id === recent.categoryId && category.kind === kind)) {
    return recent.categoryId;
  }
  return categoriesOf(state.categories, kind)[0]?.id ?? "";
}

function openCreate(): void {
  state.sheet = {
    type: "entry",
    mode: "create",
    kind: "expense",
    amount: "",
    categoryId: recentCategory("expense"),
    note: "",
    date: parisToday(),
    error: "",
  };
  render();
}

function openEdit(id: string): void {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;
  state.sheet = {
    type: "entry",
    mode: "edit",
    id,
    kind: transaction.kind,
    amount: formatInputFromCents(transaction.amountCents),
    categoryId: transaction.categoryId,
    note: transaction.note,
    date: transaction.date,
    error: "",
  };
  render();
}

function openBudget(): void {
  const current = state.budgets[state.month] ?? state.defaultBudgetCents;
  state.sheet = { type: "budget", amount: current ? formatInputFromCents(current) : "", error: "" };
  render();
}

async function saveEntry(): Promise<void> {
  if (writing || state.sheet?.type !== "entry") return;
  const sheet = state.sheet;
  const cents = parseAmountToCents(sheet.amount);
  if (cents == null) {
    sheet.error = "請輸入金額，例如 12,50。";
    render();
    return;
  }
  if (!state.categories.some((category) => category.id === sheet.categoryId && category.kind === sheet.kind)) {
    sheet.error = "請選擇分類。";
    render();
    return;
  }
  if (!isRealDate(sheet.date)) {
    sheet.error = "請選擇日期。";
    render();
    return;
  }
  writing = true;
  try {
    const now = Date.now();
    const note = sheet.note.trim();
    if (sheet.mode === "create") {
      state.transactions.push({
        id: crypto.randomUUID(),
        kind: sheet.kind,
        amountCents: cents,
        categoryId: sheet.categoryId,
        note,
        date: sheet.date,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const transaction = state.transactions.find((item) => item.id === sheet.id);
      if (!transaction) return;
      transaction.kind = sheet.kind;
      transaction.amountCents = cents;
      transaction.categoryId = sheet.categoryId;
      transaction.note = note;
      transaction.date = sheet.date;
      transaction.updatedAt = now;
    }
    state.month = sheet.date.slice(0, 7);
    state.view = "month";
    state.sheet = null;
    render(0);
    await commit();
  } finally {
    writing = false;
  }
}

async function saveBudget(): Promise<void> {
  if (writing || state.sheet?.type !== "budget") return;
  const cents = parseAmountToCents(state.sheet.amount);
  if (cents == null) {
    state.sheet.error = "請輸入金額，例如 900,00。";
    render();
    return;
  }
  writing = true;
  try {
    state.budgets[state.month] = cents;
    state.defaultBudgetCents = cents;
    state.sheet = null;
    render();
    await commit();
  } finally {
    writing = false;
  }
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function backupToFiles(): Promise<void> {
  const now = Date.now();
  const filename = `記帳-${parisToday()}.json`;
  const json = JSON.stringify(buildBackup(data(), now), null, 2);
  const file = new File([json], filename, { type: "application/json" });
  const blob = new Blob([json], { type: "application/json" });
  let shared = false;
  const canShareFiles =
    typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title: "記帳備份" });
      shared = true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      download(filename, blob);
    }
  } else {
    download(filename, blob);
  }
  state.lastExportAt = now;
  state.notice = shared
    ? "已開啟分享。請選擇「儲存到檔案」，即可放進 iCloud。"
    : "已下載 JSON 備份。請另外保存，換手機時再從備份還原。";
  render();
  await commit();
}

async function exportCsv(): Promise<void> {
  download(`記帳-${parisToday()}.csv`, new Blob([buildCsv(data())], { type: "text/csv;charset=utf-8" }));
  state.notice = "已匯出 CSV。這不是完整備份，換手機請用 JSON。";
  render();
}

function readSheetField(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement) || !state.sheet) return;
  const field = target.dataset.field;
  if (field === "amount") {
    state.sheet.amount = target.value;
    resizeAmount(target);
  } else if (field === "note" && state.sheet.type === "entry") {
    state.sheet.note = target.value;
  } else if (field === "date" && state.sheet.type === "entry") {
    state.sheet.date = target.value;
  }
}

export function bind(root: HTMLElement): void {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action ?? "";
    const view = target.dataset.view;

    if (action === "nav" && (view === "month" || view === "categories" || view === "settings")) {
      state.view = view;
      state.notice = view === "settings" ? state.notice : "";
      state.catError = "";
      state.sheet = null;
      state.dialog = null;
      render(0);
      return;
    }
    if (action === "prev-month") {
      state.month = shiftMonth(state.month, -1);
      render(0);
      return;
    }
    if (action === "next-month") {
      state.month = shiftMonth(state.month, 1);
      render(0);
      return;
    }
    if (action === "this-month") {
      state.month = parisMonth();
      render(0);
      return;
    }
    if (action === "add") return openCreate();
    if (action === "edit-txn" && target.dataset.id) return openEdit(target.dataset.id);
    if (action === "edit-budget") return openBudget();
    if (action === "close-sheet") {
      state.sheet = null;
      render();
      return;
    }
    if (action === "close-dialog") {
      state.dialog = null;
      render();
      return;
    }
    if (action === "kind" && state.sheet?.type === "entry") {
      const kind = target.dataset.kind;
      const sheet = state.sheet;
      if (kind !== "expense" && kind !== "income") return;
      sheet.kind = kind;
      if (!state.categories.some((category) => category.id === sheet.categoryId && category.kind === kind)) {
        sheet.categoryId = recentCategory(kind);
      }
      render();
      return;
    }
    if (action === "pick-cat" && state.sheet?.type === "entry" && target.dataset.id) {
      state.sheet.categoryId = target.dataset.id;
      render();
      return;
    }
    if (action === "save-entry") {
      void saveEntry();
      return;
    }
    if (action === "save-budget") {
      void saveBudget();
      return;
    }
    if (action === "ask-delete-txn" && state.sheet?.type === "entry" && state.sheet.id) {
      state.dialog = { type: "delete-txn", id: state.sheet.id };
      render();
      return;
    }
    if (action === "confirm-delete-txn" && state.dialog?.type === "delete-txn") {
      const id = state.dialog.id;
      state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
      state.dialog = null;
      state.sheet = null;
      render();
      void commit();
      return;
    }
    if (action === "ask-delete-cat" && target.dataset.id) {
      const plan = planDeleteCategory(state.categories, state.transactions, target.dataset.id);
      if (!plan.ok) {
        state.catError = plan.message;
        state.catErrorKind = state.categories.find((category) => category.id === target.dataset.id)?.kind ?? "";
        render();
        return;
      }
      state.dialog = {
        type: "delete-cat",
        id: target.dataset.id,
        count: plan.count,
        fallbackName: plan.fallback.name,
        name: plan.name,
      };
      render();
      return;
    }
    if (action === "confirm-delete-cat" && state.dialog?.type === "delete-cat") {
      const dialog = state.dialog;
      const plan = planDeleteCategory(state.categories, state.transactions, dialog.id);
      state.dialog = null;
      if (plan.ok) {
        const next = applyDeleteCategory(state.categories, state.transactions, dialog.id, plan.fallback.id, Date.now());
        state.categories = next.categories;
        state.transactions = next.transactions;
        state.catError = "";
        render();
        void commit();
      } else {
        state.catError = plan.message;
        render();
      }
      return;
    }
    if (action === "backup-share" || action === "export-json") {
      void backupToFiles();
      return;
    }
    if (action === "export-csv") {
      void exportCsv();
      return;
    }
    if (action === "import") {
      root.querySelector<HTMLInputElement>("#import-file")?.click();
      return;
    }
    if (action === "import-merge" && state.dialog?.type === "import-choice") {
      const result = mergeSnapshots(data(), state.dialog.backup);
      state.categories = result.snapshot.categories;
      state.transactions = result.snapshot.transactions;
      state.budgets = result.snapshot.budgets;
      state.defaultBudgetCents = result.snapshot.defaultBudgetCents;
      state.lastExportAt = result.snapshot.lastExportAt;
      state.dialog = null;
      state.notice = result.added > 0 ? `已合併 ${result.added} 筆紀錄。` : "沒有新的紀錄需要合併。";
      render();
      void commit();
      return;
    }
    if (action === "import-replace" && state.dialog?.type === "import-choice") {
      const next = snapshotFromBackup(state.dialog.backup);
      state.categories = next.categories;
      state.transactions = next.transactions;
      state.budgets = next.budgets;
      state.defaultBudgetCents = next.defaultBudgetCents;
      state.lastExportAt = next.lastExportAt;
      state.dialog = null;
      state.notice = "已用備份取代這台裝置上的資料。";
      render();
      void commit();
    }
  });

  root.addEventListener("input", (event) => {
    readSheetField(event.target);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.field === "date") readSheetField(target);
    if (target instanceof HTMLInputElement && target.dataset.field === "rename" && target.dataset.id) {
      const id = target.dataset.id;
      const result = renameCategory(state.categories, id, target.value);
      if (result.error) {
        state.catError = nameError[result.error];
        state.catErrorKind = state.categories.find((category) => category.id === id)?.kind ?? "";
        render();
        return;
      }
      if (result.categories !== state.categories) {
        state.categories = result.categories;
        state.catError = "";
        render();
        void commit();
      }
      return;
    }
    if (target instanceof HTMLInputElement && target.id === "import-file" && target.files?.[0]) {
      const file = target.files[0];
      target.value = "";
      void file.text().then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          state.dialog = { type: "alert", title: "無法匯入", text: "這份檔案不是有效的 JSON。" };
          render();
          return;
        }
        const result = validateBackup(parsed);
        if (!result.ok) {
          state.dialog = { type: "alert", title: "無法匯入", text: result.message };
          render();
          return;
        }
        state.dialog = { type: "import-choice", backup: result.backup };
        render();
      });
    }
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.action !== "add-cat") return;
    event.preventDefault();
    const kind: Kind = form.dataset.kind === "income" ? "income" : "expense";
    const field = form.elements.namedItem("name");
    const name = field instanceof HTMLInputElement ? field.value : "";
    const result = addCategory(state.categories, kind, name);
    if (result.error === "empty") return;
    if (result.error) {
      state.catError = nameError[result.error];
      state.catErrorKind = kind;
      render();
      return;
    }
    state.categories = result.categories;
    state.catError = "";
    render();
    void commit();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.dialog) state.dialog = null;
      else if (state.sheet) state.sheet = null;
      else return;
      render();
      return;
    }
    if (event.key !== "Enter") return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.field === "rename") {
      target.blur();
      return;
    }
    if (!state.sheet || state.dialog || !(target instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (state.sheet.type === "entry") void saveEntry();
    else void saveBudget();
  });
}
