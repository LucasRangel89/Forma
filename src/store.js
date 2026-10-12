// Armazenamento local-first. A UI só conhece a interface Store; trocar o backend (IndexedDB -> servidor) não muda o resto.
const COLLECTIONS = ['sessions', 'plans', 'checkins', 'exercises', 'mappings', 'settings'];

export function memoryBackend() {
  const data = Object.fromEntries(COLLECTIONS.map(c => [c, new Map()]));
  return {
    async all(c) { return [...data[c].values()]; },
    async get(c, id) { return data[c].get(id) ?? null; },
    async putMany(c, items) { for (const it of items) data[c].set(it.id, structuredClone(it)); },
    async remove(c, id) { data[c].delete(id); },
    async clear(c) { data[c].clear(); }
  };
}

export function indexedDbBackend(name = 'forma-local', idb = globalThis.indexedDB) {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const rq = idb.open(name, 1);
    rq.onupgradeneeded = () => { for (const c of COLLECTIONS) rq.result.createObjectStore(c, { keyPath: 'id' }); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  const tx = async (c, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(c, mode), store = t.objectStore(c);
      let out; try { out = fn(store); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  return {
    all: c => tx(c, 'readonly', s => s.getAll()),
    get: async (c, id) => (await tx(c, 'readonly', s => s.get(id))) ?? null,
    putMany: (c, items) => tx(c, 'readwrite', s => { items.forEach(i => s.put(i)); }),
    remove: (c, id) => tx(c, 'readwrite', s => { s.delete(id); }),
    clear: c => tx(c, 'readwrite', s => { s.clear(); })
  };
}

export function createStore(backend) {
  const store = {
    all: c => backend.all(c),
    get: (c, id) => backend.get(c, id),
    put: (c, item) => backend.putMany(c, [item]),
    putMany: (c, items) => backend.putMany(c, items),
    remove: (c, id) => backend.remove(c, id),
    async sessionsSorted() { return (await backend.all('sessions')).sort((a, b) => (a.date < b.date ? -1 : 1)); },
    async getSettings() { return (await backend.get('settings', 'main')) || { id: 'main' }; },
    async saveSettings(s) { await backend.putMany('settings', [{ ...s, id: 'main' }]); },
    async getMappings() { const m = await backend.get('mappings', 'main'); return m?.map || {}; },
    async saveMappings(map) { await backend.putMany('mappings', [{ id: 'main', map }]); },
    /** Grava o resultado de importDiario (idempotente: mesmos ids sobrescrevem). */
    async applyImport(result) {
      await backend.putMany('sessions', result.sessions);
      await backend.putMany('plans', result.plans);
      if (result.profile?.bodyweight) await store.saveSettings({ ...(await store.getSettings()), bodyweight: result.profile.bodyweight });
    },
    async exportAll() {
      const out = { format: 'forma-backup', version: 1 };
      for (const c of COLLECTIONS) out[c] = await backend.all(c);
      return out;
    },
    async importAll(json) {
      if (json?.format !== 'forma-backup') throw new Error('Arquivo não é um backup do Forma.');
      for (const c of COLLECTIONS) { await backend.clear(c); if (Array.isArray(json[c])) await backend.putMany(c, json[c]); }
    }
  };
  return store;
}
