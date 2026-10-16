/**
 * Adaptador de storage em blocos para expo-secure-store (limite ~2 KB por valor): a sessão do
 * Supabase pode passar disso. Não é autoridade de nada (spec 49): guarda apenas o refresh/JWT.
 */
export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** 600 unidades UTF-16 ≤ 1.800 bytes no pior caso (3 bytes/unidade na BMP), abaixo de 2.048. */
export const DEFAULT_CHUNK_SIZE = 600;

export function splitIntoChunks(value: string, size: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < value.length) {
    let end = Math.min(i + size, value.length);
    const last = value.charCodeAt(end - 1);
    // não cortar no meio de um par substituto (evita corromper emoji/símbolos)
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(value.slice(i, end));
    i = end;
  }
  return chunks;
}

export function createChunkedStorage(
  backend: KeyValueBackend,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): KeyValueBackend {
  const countKey = (key: string) => `${key}.n`;
  const chunkKey = (key: string, i: number) => `${key}.${i}`;

  const readCount = async (key: string): Promise<number> => {
    const raw = await backend.getItem(countKey(key));
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };

  const removeItem = async (key: string): Promise<void> => {
    const n = await readCount(key);
    await Promise.all(Array.from({ length: n }, (_, i) => backend.removeItem(chunkKey(key, i))));
    await backend.removeItem(countKey(key));
  };

  return {
    async getItem(key) {
      const n = await readCount(key);
      if (n === 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await backend.getItem(chunkKey(key, i));
        if (part === null) return null; // sessão corrompida: tratar como ausente
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      await removeItem(key);
      const chunks = splitIntoChunks(value, chunkSize);
      for (let i = 0; i < chunks.length; i++) {
        await backend.setItem(chunkKey(key, i), chunks[i] as string);
      }
      await backend.setItem(countKey(key), String(chunks.length)); // contador por último
    },
    removeItem,
  };
}
