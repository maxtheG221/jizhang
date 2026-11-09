export type Kind = "expense" | "income";

export type Category = {
  id: string;
  kind: Kind;
  name: string;
  sort: number;
  locked?: boolean;
};

export type Transaction = {
  id: string;
  kind: Kind;
  amountCents: number;
  categoryId: string;
  note: string;
  date: string;
  createdAt: number;
  updatedAt: number;
};

export type Snapshot = {
  categories: Category[];
  transactions: Transaction[];
  budgets: Record<string, number>;
  defaultBudgetCents: number | null;
  lastExportAt: number | null;
};

export type Backup = {
  app: "記帳";
  version: 1;
  exportedAt: string;
  categories: Category[];
  transactions: Transaction[];
  budgets: Record<string, number>;
  defaultBudgetCents: number | null;
  lastExportAt: number | null;
};
