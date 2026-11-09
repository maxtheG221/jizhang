import { defaultCategories } from "./categories";
import type { Snapshot } from "./types";

const DB_NAME = "jizhang";
const DB_VERSION = 1;
const SNAPSHOT_KEY = "snapshot";
const LOCAL_KEY = "jizhang.v1";

export function emptySnapshot(): Snapshot {
  return {
    categories: [],
    transactions: [],
    budgets: {},
    defaultBudgetCents: null,
    lastExportAt: null,
  };
}

function sanitize(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Snapshot>;
  if (!Array.isArray(value.categories) || !Array.isArray(value.transactions)) return null;
  const budgets = value.budgets && typeof value.budgets === "object" ? value.budgets : {};
  return {
    categories: value.categories,
    transactions: value.transactions,
    budgets,
    defaultBudgetCents: typeof value.defaultBudgetCents === "number" ? value.defaultBudgetCents : null,
    lastExportAt: typeof value.lastExportAt === "number" ? value.lastExportAt : null,
  };
}

type Store = {
  read: () => Promise<Snapshot | null>;
  write: (snapshot: Snapshot) => Promise<void>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbStore(db: IDBDatabase): Store {
  return {
    read: () =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readonly");
        const request = tx.objectStore("kv").get(SNAPSHOT_KEY);
        request.onsuccess = () => {
          const row = request.result as { value?: unknown } | undefined;
          resolve(sanitize(row?.value) );
        };
        request.onerror = () => reject(request.error);
      }),
    write: (snapshot) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put({ key: SNAPSHOT_KEY, value: snapshot });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  };
}

function localStore(): Store {
  return {
    read: async () => {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return null;
        return sanitize(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    },
    write: async (snapshot) => {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
    },
  };
}

let store: Store | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function getStore(): Promise<Store> {
  if (store) return store;
  try {
    if (typeof indexedDB === "undefined") throw new Error("no idb");
    const db = await openDb();
    store = idbStore(db);
    await store.read();
    return store;
  } catch {
    store = localStore();
    return store;
  }
}

export async function loadSnapshot(): Promise<Snapshot> {
  const active = await getStore();
  const loaded = (await active.read()) ?? emptySnapshot();
  if (loaded.categories.length === 0) {
    loaded.categories = defaultCategories();
    await active.write(loaded);
  }
  return loaded;
}

export function persist(snapshot: Snapshot): Promise<void> {
  const copy = structuredClone(snapshot);
  const run = chain.then(async () => {
    const active = await getStore();
    await active.write(copy);
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run.then(() => undefined);
}
