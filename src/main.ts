import { bind } from "./actions";
import { loadSnapshot } from "./db";
import { registerSW } from "./pwa";
import { render } from "./render";
import { state } from "./state";
import { parisMonth } from "./time";
import "./styles.css";

async function boot(): Promise<void> {
  try {
    const snapshot = await loadSnapshot();
    state.categories = snapshot.categories;
    state.transactions = snapshot.transactions;
    state.budgets = snapshot.budgets;
    state.defaultBudgetCents = snapshot.defaultBudgetCents;
    state.lastExportAt = snapshot.lastExportAt;
    state.month = parisMonth();
    state.ready = true;
  } catch {
    state.ready = true;
    state.error = "無法讀取這台裝置上的帳本。請確認沒有開啟無痕瀏覽，然後重新開啟。";
  }
  const root = document.querySelector("#app");
  if (root instanceof HTMLElement) bind(root);
  render();
  registerSW();
}

void boot();
