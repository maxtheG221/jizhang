import type { Backup, Category, Kind, Transaction } from "./types";

export type EntrySheet = {
  type: "entry";
  mode: "create" | "edit";
  id?: string;
  kind: Kind;
  amount: string;
  categoryId: string;
  note: string;
  date: string;
  error: string;
};

export type BudgetSheet = {
  type: "budget";
  amount: string;
  error: string;
};

export type Sheet = EntrySheet | BudgetSheet | null;

export type Dialog =
  | null
  | { type: "delete-txn"; id: string }
  | { type: "delete-cat"; id: string; count: number; fallbackName: string; name: string }
  | { type: "import-choice"; backup: Backup }
  | { type: "alert"; title: string; text: string };

export type ViewName = "month" | "categories" | "settings";

export type AppState = {
  ready: boolean;
  error: string;
  view: ViewName;
  month: string;
  categories: Category[];
  transactions: Transaction[];
  budgets: Record<string, number>;
  defaultBudgetCents: number | null;
  lastExportAt: number | null;
  sheet: Sheet;
  dialog: Dialog;
  notice: string;
  catError: string;
  catErrorKind: "" | "expense" | "income";
};

export const state: AppState = {
  ready: false,
  error: "",
  view: "month",
  month: "",
  categories: [],
  transactions: [],
  budgets: {},
  defaultBudgetCents: null,
  lastExportAt: null,
  sheet: null,
  dialog: null,
  notice: "",
  catError: "",
  catErrorKind: "",
};
