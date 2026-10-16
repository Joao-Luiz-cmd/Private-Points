import type { KeyValueBackend } from '../chunkedStorage';
import { createChunkedStorage, splitIntoChunks } from '../chunkedStorage';

function memoryBackend(limit = 2048) {
  const data = new Map<string, string>();
  const backend: KeyValueBackend = {
    async getItem(k) {
      return data.get(k) ?? null;
    },
    async setItem(k, v) {
      if (Buffer.byteLength(v, 'utf8') > limit) throw new Error('value too large');
      data.set(k, v);
    },
    async removeItem(k) {
      data.delete(k);
    },
  };
  return { backend, data };
}

describe('chunkedStorage', () => {
  it('guarda e devolve valores maiores que o limite do backend', async () => {
    const { backend } = memoryBackend();
    const store = createChunkedStorage(backend);
    const big = JSON.stringify({ access_token: 'x'.repeat(5000), user: { name: 'José Ação' } });
    await store.setItem('sb-auth-token', big);
    expect(await store.getItem('sb-auth-token')).toBe(big);
  });

  it('nenhum bloco excede o limite, mesmo com caracteres multibyte', async () => {
    const { backend } = memoryBackend(2048);
    const store = createChunkedStorage(backend);
    await store.setItem('k', 'ção€'.repeat(2000)); // lançaria "value too large" se algum bloco passasse
    expect((await store.getItem('k'))?.length).toBe(8000);
  });

  it('não corta pares substitutos (emoji) ao dividir', () => {
    const value = '😀'.repeat(50);
    const chunks = splitIntoChunks(value, 7); // 7 unidades cairia no meio de um par
    expect(chunks.join('')).toBe(value);
    for (const c of chunks) expect(c.length % 2).toBe(0);
  });

  it('sobrescrever com valor menor remove blocos antigos', async () => {
    const { backend, data } = memoryBackend();
    const store = createChunkedStorage(backend, 10);
    await store.setItem('k', 'a'.repeat(100));
    await store.setItem('k', 'b'.repeat(15));
    expect(await store.getItem('k')).toBe('b'.repeat(15));
    expect([...data.keys()].sort()).toEqual(['k.0', 'k.1', 'k.n']);
  });

  it('removeItem apaga tudo e getItem devolve null', async () => {
    const { backend, data } = memoryBackend();
    const store = createChunkedStorage(backend, 10);
    await store.setItem('k', 'a'.repeat(50));
    await store.removeItem('k');
    expect(await store.getItem('k')).toBeNull();
    expect(data.size).toBe(0);
  });

  it('bloco ausente (corrompido) é tratado como sessão ausente', async () => {
    const { backend, data } = memoryBackend();
    const store = createChunkedStorage(backend, 10);
    await store.setItem('k', 'a'.repeat(50));
    data.delete('k.2');
    expect(await store.getItem('k')).toBeNull();
  });
});
