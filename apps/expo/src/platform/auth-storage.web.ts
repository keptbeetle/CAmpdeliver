const memoryStorage = new Map<string, string>();

function browserStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

export const authStorage = {
  getItem(key: string): Promise<string | null> {
    return Promise.resolve(
      browserStorage()?.getItem(key) ?? memoryStorage.get(key) ?? null,
    );
  },
  setItem(key: string, value: string): Promise<void> {
    const storage = browserStorage();
    if (storage) storage.setItem(key, value);
    else memoryStorage.set(key, value);
    return Promise.resolve();
  },
  removeItem(key: string): Promise<void> {
    const storage = browserStorage();
    if (storage) storage.removeItem(key);
    memoryStorage.delete(key);
    return Promise.resolve();
  },
};
