import { shouldWarnBackup } from "./backup";
import { categoriesOf } from "./categories";
import { icons } from "./icons";
import { formatEUR, sharePercents, sumCents } from "./money";
import { state } from "./state";
import type { EntrySheet } from "./state";
import type { Kind, Transaction } from "./types";
import { dayLabel, monthLabel, parisToday } from "./time";
import { formatStamp } from "./time";

let sheetWasOpen = false;
let stickyObserver: IntersectionObserver | null = null;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function fitAmount(input: HTMLInputElement): void {
  const text = input.value.length > 0 ? input.value : input.placeholder;
  input.style.width = `${Math.max(text.length, 4) + 0.5}ch`;
}

function watchSticky(root: ParentNode): void {
  stickyObserver?.disconnect();
  const sentinel = root.querySelector("[data-sentinel]");
  const header = root.querySelector(".top");
  const scroll = root.querySelector(".scroll");
  if (!(sentinel instanceof Element) || !(header instanceof HTMLElement) || !(scroll instanceof Element)) return;
  stickyObserver = new IntersectionObserver(
    ([entry]) => {
      header.classList.toggle("is-stuck", entry ? !entry.isIntersecting : false);
    },
    { root: scroll, threshold: 0 },
  );
  stickyObserver.observe(sentinel);
}

export function render(scrollTop?: number): void {
  const root = document.querySelector("#app");
  if (!(root instanceof HTMLElement)) return;
  const previous = root.querySelector(".scroll");
  const top = scrollTop ?? (previous instanceof HTMLElement ? previous.scrollTop : 0);
  const opening = Boolean(state.sheet) && !sheetWasOpen;
  root.innerHTML = markup(opening);
  sheetWasOpen = Boolean(state.sheet);
  const next = root.querySelector(".scroll");
  if (next instanceof HTMLElement) next.scrollTop = top;
  if (opening) {
    const sheet = root.querySelector(".sheet");
    const backdrop = root.querySelector(".sheet-layer .backdrop");
    requestAnimationFrame(() => {
      sheet?.classList.add("is-open");
      backdrop?.classList.add("is-open");
      root.querySelector<HTMLElement>("[data-open-focus]")?.focus();
    });
  }
  const amount = root.querySelector<HTMLInputElement>('[data-field="amount"]');
  if (amount) fitAmount(amount);
  watchSticky(root);
  if (state.dialog) root.querySelector<HTMLElement>("[data-autofocus]")?.focus();
}

export function resizeAmount(input: HTMLInputElement): void {
  fitAmount(input);
}

function markup(opening: boolean): string {
  if (!state.ready) {
    return `<div class="app"><div class="boot"><p class="brand">記帳</p><div class="brand-rule"></div></div></div>`;
  }
  if (state.error) {
    return `<div class="app"><div class="boot"><p class="brand">記帳</p><div class="brand-rule"></div><h1>無法開啟帳本</h1><p>${esc(state.error)}</p></div></div>`;
  }
  const modal = state.sheet || state.dialog ? "is-modal" : "";
  return `
    <div class="app ${modal}" data-ready data-view="${state.view}">
      ${state.view === "month" ? monthView() : state.view === "categories" ? categoriesView() : settingsView()}
      ${tabs()}
      ${sheetLayer(opening)}
      ${dialogLayer()}
    </div>
  `;
}

function monthView(): string {
  const today = parisToday();
  const label = monthLabel(state.month);
  const txns = state.transactions
    .filter((transaction) => transaction.date.startsWith(state.month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const onThisMonth = state.month === today.slice(0, 7);
  return `
    <main class="scroll">
      <div data-sentinel></div>
      <header class="top">
        <p class="brand">記帳</p>
        <div class="brand-rule"></div>
        <div class="month-switch">
          <button type="button" class="icon-btn" data-action="prev-month" aria-label="上個月">${icons.chevronLeft}</button>
          <div>
            <h1>${label.month}</h1>
            <p class="year">${label.year}</p>
          </div>
          <button type="button" class="icon-btn" data-action="next-month" aria-label="下個月">${icons.chevronRight}</button>
        </div>
        ${onThisMonth ? "" : `<button type="button" class="back-today" data-action="this-month">回到本月</button>`}
      </header>
      ${backupBanner()}
      ${txns.length === 0 ? emptyMonth() : dashboard(txns, today)}
    </main>
  `;
}

function budgetValue(): { cents: number | null; inherited: boolean } {
  if (Object.prototype.hasOwnProperty.call(state.budgets, state.month)) {
    return { cents: state.budgets[state.month] ?? null, inherited: false };
  }
  return { cents: state.defaultBudgetCents, inherited: state.defaultBudgetCents != null };
}

function budgetCard(expense: number): string {
  const { cents, inherited } = budgetValue();
  if (cents == null) {
    return `
      <button type="button" class="budget budget-empty" data-action="edit-budget">
        <span>
          <span class="kicker">本月預算</span>
          <span class="budget-empty-title">尚未設定</span>
        </span>
        <span class="text-link">設定</span>
      </button>
    `;
  }
  const over = expense > cents;
  const ratio = Math.min(expense / cents, 1);
  const used = Math.round((expense / cents) * 100);
  const remain = cents - expense;
  return `
    <section class="budget">
      <div class="budget-top">
        <div>
          <p class="kicker">本月預算</p>
          <p class="budget-amt num">${formatEUR(cents)}</p>
          ${inherited ? `<p class="hint">沿用上次設定</p>` : ""}
        </div>
        <button type="button" class="text-link" data-action="edit-budget">修改</button>
      </div>
      <div class="meter ${over ? "is-over" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(used, 100)}" aria-label="預算使用">
        <div class="meter-fill" style="width:${(ratio * 100).toFixed(1)}%"></div>
      </div>
      <div class="budget-foot">
        <span>已用 ${used}%</span>
        ${over ? `<span class="warn">已超出 ${formatEUR(expense - cents)}</span>` : `<span>剩餘 ${formatEUR(remain)}</span>`}
      </div>
    </section>
  `;
}

function dashboard(txns: Transaction[], today: string): string {
  const expense = sumCents(txns.filter((transaction) => transaction.kind === "expense").map((transaction) => transaction.amountCents));
  const income = sumCents(txns.filter((transaction) => transaction.kind === "income").map((transaction) => transaction.amountCents));
  const net = income - expense;
  return `
    <section class="hero">
      <p class="kicker">總支出</p>
      <p class="hero-amount num">${formatEUR(expense)}</p>
      <div class="hero-split">
        <div>
          <p class="kicker">總收入</p>
          <p class="sub-amount num">${formatEUR(income)}</p>
        </div>
        <div>
          <p class="kicker">淨額</p>
          <p class="sub-amount num ${net < 0 ? "is-neg" : ""}">${formatEUR(net)}</p>
        </div>
      </div>
    </section>
    ${budgetCard(expense)}
    ${categoryShare(txns)}
    <section class="section ledger">
      <h2 class="section-label">明細</h2>
      ${dayGroups(txns, today)}
    </section>
  `;
}

function categoryShare(txns: Transaction[]): string {
  const totals = new Map<string, number>();
  for (const transaction of txns) {
    if (transaction.kind !== "expense") continue;
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + transaction.amountCents);
  }
  const rows = [...totals.entries()]
    .map(([id, cents]) => ({
      id,
      cents,
      name: state.categories.find((category) => category.id === id)?.name ?? "未分類",
    }))
    .sort((a, b) => b.cents - a.cents);
  if (rows.length === 0) return "";
  const total = sumCents(rows.map((row) => row.cents));
  const percents = sharePercents(rows.map((row) => row.cents));
  const bars = rows
    .map((row, index) => {
      const width = total > 0 ? (row.cents / total) * 100 : 0;
      const tone = index === 3 ? "seg-3" : `seg-${Math.min(index, 4)}`;
      return `<span class="${tone}" style="width:${width}%"></span>`;
    })
    .join("");
  const list = rows
    .map((row, index) => {
      const tone = index === 3 ? "seg-3" : `seg-${Math.min(index, 4)}`;
      return `
        <div class="share-row">
          <span class="swatch ${tone}"></span>
          <span class="share-name">${esc(row.name)}</span>
          <span class="share-amt num">${formatEUR(row.cents)}</span>
          <span class="share-pct">${percents[index] ?? 0}%</span>
        </div>
      `;
    })
    .join("");
  return `
    <section class="section">
      <h2 class="section-label">分類佔比</h2>
      <div class="stack" aria-hidden="true">${bars}</div>
      ${list}
    </section>
  `;
}

function dayGroups(txns: Transaction[], today: string): string {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of txns) {
    const list = groups.get(transaction.date) ?? [];
    list.push(transaction);
    groups.set(transaction.date, list);
  }
  return [...groups.entries()]
    .map(([date, list]) => {
      const label = dayLabel(date, today);
      const expense = sumCents(list.filter((item) => item.kind === "expense").map((item) => item.amountCents));
      const income = sumCents(list.filter((item) => item.kind === "income").map((item) => item.amountCents));
      const subtotal =
        expense > 0 && income > 0
          ? `<span><i>支出</i><b class="num">${formatEUR(expense)}</b></span><span><i>收入</i><b class="num">${formatEUR(income)}</b></span>`
          : expense > 0
            ? `<span><i>小計</i><b class="num">${formatEUR(expense)}</b></span>`
            : `<span><i>收入</i><b class="num">${formatEUR(income)}</b></span>`;
      const items = list
        .map((transaction) => {
          const name = state.categories.find((category) => category.id === transaction.categoryId)?.name ?? "未分類";
          const amount = `${transaction.kind === "income" ? `<span class="plus">+</span>` : ""}${formatEUR(transaction.amountCents)}`;
          return `
            <button type="button" class="txn" data-action="edit-txn" data-id="${esc(transaction.id)}" aria-label="${esc(`${name} ${transaction.note} ${formatEUR(transaction.amountCents)}`)}">
              <span class="txn-main">
                <span class="txn-cat">${esc(name)}</span>
                ${transaction.note ? `<span class="txn-note">${esc(transaction.note)}</span>` : ""}
              </span>
              <span class="txn-amt num">${amount}</span>
            </button>
          `;
        })
        .join("");
      return `
        <article class="day">
          <header class="day-head">
            <div>
              <span class="day-date">${label.date}</span>
              <span class="day-week">${label.week}</span>
              ${label.tag ? `<span class="tag">${label.tag}</span>` : ""}
            </div>
            <div class="day-sub">${subtotal}</div>
          </header>
          ${items}
        </article>
      `;
    })
    .join("");
}

function emptyMonth(): string {
  const { cents } = budgetValue();
  const budget = cents == null ? "" : budgetCard(0);
  return `
    ${budget}
    <div class="empty ${cents == null ? "" : "compact"}" data-empty>
      <div class="empty-mark"></div>
      <h2>這個月還沒有紀錄</h2>
      <p>從一筆早餐、一張月票，或生活費開始。</p>
      <button type="button" class="btn btn-inline" data-action="add">記一筆</button>
      ${cents == null ? `<button type="button" class="text-link" data-action="edit-budget">設定本月預算</button>` : ""}
    </div>
  `;
}

function categoriesView(): string {
  return `
    <main class="scroll">
      <div data-sentinel></div>
      <header class="top">
        <p class="brand">記帳</p>
        <div class="brand-rule"></div>
      </header>
      <p class="page-kicker">管理</p>
      <h1 class="page-title">分類</h1>
      <p class="page-lead">可以改名、新增或刪除。刪除仍有紀錄的分類時，那些紀錄會改歸到「其他」或「其他收入」。</p>
      ${categoryEditor("expense", "支出")}
      ${categoryEditor("income", "收入")}
    </main>
  `;
}

function categoryEditor(kind: Kind, title: string): string {
  const rows = categoriesOf(state.categories, kind)
    .map((category) => {
      return `
        <div class="cat-row">
          <input data-field="rename" data-id="${esc(category.id)}" value="${esc(category.name)}" maxlength="16" aria-label="分類名稱" autocomplete="off" />
          ${category.locked ? "" : `<button type="button" class="row-action" data-action="ask-delete-cat" data-id="${esc(category.id)}">刪除</button>`}
        </div>
      `;
    })
    .join("");
  return `
    <section class="cat-block">
      <h2>${title}</h2>
      ${rows}
      <form class="add-row" data-action="add-cat" data-kind="${kind}">
        <input name="name" maxlength="16" placeholder="新的${title}分類" aria-label="新的${title}分類" autocomplete="off" />
        <button type="submit">加入</button>
      </form>
      ${state.catError && state.catErrorKind === kind ? `<p class="form-note">${esc(state.catError)}</p>` : ""}
    </section>
  `;
}

function backupBanner(): string {
  if (!shouldWarnBackup(state.transactions.length, state.lastExportAt)) return "";
  const text =
    state.lastExportAt == null
      ? "還沒有備份。換手機前，請先存到 iCloud 或檔案。"
      : "上次備份已超過 7 天。換手機前，請再備份一次。";
  return `
    <button type="button" class="backup-banner" data-action="nav" data-view="settings">
      <span>${text}</span>
      <span class="banner-go">前往備份</span>
    </button>
  `;
}

function settingsView(): string {
  const backedUp = state.lastExportAt == null ? "尚未備份" : formatStamp(state.lastExportAt);
  return `
    <main class="scroll">
      <div data-sentinel></div>
      <header class="top">
        <p class="brand">記帳</p>
        <div class="brand-rule"></div>
      </header>
      <p class="page-kicker">設定</p>
      <h1 class="page-title">備份</h1>
      <div class="callout">換手機時，帳本不會跟著走。請把備份存到 iCloud 或檔案，到新手機再還原。iPhone 的 Safari 若一段時間沒有打開這個網頁，也可能清掉網站資料。</div>
      ${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ""}
      <button type="button" class="btn backup-cta" data-action="backup-share">備份到 iCloud／檔案</button>
      <p class="backup-hint">在 iPhone 的分享畫面選擇「儲存到檔案」，就能放進 iCloud 雲碟。若這台裝置沒有分享，會改為下載 JSON。</p>
      <button type="button" class="btn-ghost backup-restore" data-action="import">從備份還原</button>
      <div class="settings-list">
        <div class="settings-row"><span>上次備份</span><span>${esc(backedUp)}</span></div>
        <button type="button" data-action="export-csv">匯出 CSV</button>
      </div>
      <p class="footnote">紀錄只存在這台裝置，不會上傳到伺服器。</p>
      <input id="import-file" type="file" accept="application/json,.json" hidden />
    </main>
  `;
}

function showQuickAdd(): boolean {
  return !(state.view === "month" && !state.transactions.some((transaction) => transaction.date.startsWith(state.month)));
}

function tabs(): string {
  const item = (view: "month" | "categories" | "settings", label: string, icon: string) => {
    const current = state.view === view ? `aria-current="page"` : "";
    return `<button type="button" class="tab" data-action="nav" data-view="${view}" ${current}>${icon}<span>${label}</span></button>`;
  };
  const add = showQuickAdd()
    ? `<button type="button" class="tab-add" data-action="add">${icons.plus}<span>記一筆</span></button>`
    : "";
  return `
    <nav class="tabs" aria-label="主要">
      ${item("month", "本月", icons.ledger)}
      ${item("categories", "分類", icons.tags)}
      ${item("settings", "設定", icons.settings)}
      ${add}
    </nav>
  `;
}

function sheetLayer(opening: boolean): string {
  if (!state.sheet) return "";
  const sheetClass = opening ? "sheet anim" : "sheet is-open";
  const backClass = opening ? "backdrop anim" : "backdrop is-open";
  const body = state.sheet.type === "entry" ? entrySheet(state.sheet) : budgetSheet();
  return `<div class="overlay sheet-layer"><div class="${backClass}" data-action="close-sheet"></div><div class="${sheetClass}" role="dialog" aria-modal="true">${body}</div></div>`;
}

function entrySheet(sheet: EntrySheet): string {
  const chips = categoriesOf(state.categories, sheet.kind)
    .map((category) => {
      const pressed = category.id === sheet.categoryId ? "true" : "false";
      return `<button type="button" class="chip" data-action="pick-cat" data-id="${esc(category.id)}" aria-pressed="${pressed}">${esc(category.name)}</button>`;
    })
    .join("");
  return `
    <div class="grabber"></div>
    <div class="sheet-bar">
      <h2 id="sheet-title">${sheet.mode === "create" ? "記一筆" : "編輯紀錄"}</h2>
      <button type="button" data-action="close-sheet">關閉</button>
    </div>
    <div class="amount-field">
      <span class="ccy">€</span>
      <input data-field="amount" data-open-focus inputmode="decimal" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="0,00" aria-label="金額" value="${esc(sheet.amount)}" />
    </div>
    <div class="segment" role="group" aria-label="類型">
      <button type="button" data-action="kind" data-kind="expense" aria-pressed="${sheet.kind === "expense"}">支出</button>
      <button type="button" data-action="kind" data-kind="income" aria-pressed="${sheet.kind === "income"}">收入</button>
    </div>
    <div class="chips">${chips}</div>
    <label class="field">
      <span>備註</span>
      <input data-field="note" maxlength="80" placeholder="選填" autocomplete="off" value="${esc(sheet.note)}" />
    </label>
    <label class="field">
      <span>日期</span>
      <input data-field="date" type="date" value="${esc(sheet.date)}" />
    </label>
    <p class="form-error" role="alert">${esc(sheet.error)}</p>
    <button type="button" class="btn" data-action="save-entry">儲存</button>
    ${sheet.mode === "edit" ? `<button type="button" class="btn-quiet" data-action="ask-delete-txn">刪除這筆紀錄</button>` : ""}
  `;
}

function budgetSheet(): string {
  if (state.sheet?.type !== "budget") return "";
  return `
    <div class="grabber"></div>
    <div class="sheet-bar">
      <h2>本月預算</h2>
      <button type="button" data-action="close-sheet">關閉</button>
    </div>
    <div class="amount-field">
      <span class="ccy">€</span>
      <input data-field="amount" data-open-focus inputmode="decimal" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="0,00" aria-label="預算金額" value="${esc(state.sheet.amount)}" />
    </div>
    <p class="helper">之後還沒另外設定的月份，會沿用這個金額。</p>
    <p class="form-error" role="alert">${esc(state.sheet.error)}</p>
    <button type="button" class="btn" data-action="save-budget">儲存</button>
  `;
}

function dialogLayer(): string {
  const dialog = state.dialog;
  if (!dialog) return "";
  let title = "";
  let text = "";
  let actions = "";
  if (dialog.type === "delete-txn") {
    title = "刪除紀錄";
    text = "這筆紀錄會從這台裝置移除，無法復原。";
    actions = `
      <button type="button" class="btn" data-action="close-dialog" data-autofocus>取消</button>
      <button type="button" class="btn-quiet" data-action="confirm-delete-txn">刪除</button>
    `;
  } else if (dialog.type === "delete-cat") {
    title = "刪除分類";
    text =
      dialog.count > 0
        ? `「${dialog.name}」目前有 ${dialog.count} 筆紀錄。刪除後，這些紀錄會改歸到「${dialog.fallbackName}」。`
        : `要刪除「${dialog.name}」嗎？此動作無法復原。`;
    actions = `
      <button type="button" class="btn" data-action="close-dialog" data-autofocus>取消</button>
      <button type="button" class="btn-quiet" data-action="confirm-delete-cat">刪除</button>
    `;
  } else if (dialog.type === "import-choice") {
    title = "從備份還原";
    text = `這份備份有 ${dialog.backup.transactions.length} 筆紀錄。合併會保留這台裝置上的資料，只補上沒有的項目。取代會改以這份備份為準。`;
    actions = `
      <button type="button" class="btn" data-action="import-merge" data-autofocus>合併</button>
      <button type="button" class="btn-ghost is-warn" data-action="import-replace">取代</button>
      <button type="button" class="btn-text" data-action="close-dialog">取消</button>
    `;
  } else {
    title = dialog.title;
    text = dialog.text;
    actions = `<button type="button" class="btn" data-action="close-dialog" data-autofocus>關閉</button>`;
  }
  return `
    <div class="overlay dialog-layer">
      <div class="backdrop is-open" data-action="close-dialog"></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">${esc(title)}</h2>
        <p>${esc(text)}</p>
        ${actions}
      </div>
    </div>
  `;
}
