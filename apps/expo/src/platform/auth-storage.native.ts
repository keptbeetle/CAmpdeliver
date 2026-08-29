import * as SecureStore from "expo-secure-store";

// Android SecureStore limits key values to ~2048 bytes (2KB).
// Supabase JWT session tokens frequently exceed this length.
// We split values into chunks of 1000 bytes for cross-platform reliability.

const CHUNK_SIZE = 1000;

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const mainValue = await SecureStore.getItemAsync(key);
      if (mainValue !== null) {
        return mainValue;
      }

      // Check for chunked storage
      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunk_count`);
      if (!chunkCountStr) {
        return null;
      }

      const count = parseInt(chunkCountStr, 10);
      if (isNaN(count) || count <= 0) {
        return null;
      }

      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
        if (chunk === null) {
          return null;
        }
        chunks.push(chunk);
      }

      return chunks.join("");
    } catch (err) {
      console.error(`[authStorage] getItem error for ${key}:`, err);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      // First clean up any existing chunks
      await this.removeItem(key);

      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }

      // Split into chunks if value exceeds limit
      const count = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}_chunk_count`, count.toString());

      for (let i = 0; i < count; i++) {
        const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk);
      }
    } catch (err) {
      console.error(`[authStorage] setItem error for ${key}:`, err);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);

      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunk_count`);
      if (chunkCountStr) {
        const count = parseInt(chunkCountStr, 10);
        await SecureStore.deleteItemAsync(`${key}_chunk_count`);

        if (!isNaN(count) && count > 0) {
          for (let i = 0; i < count; i++) {
            await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
          }
        }
      }
    } catch (err) {
      console.error(`[authStorage] removeItem error for ${key}:`, err);
    }
  },
};
