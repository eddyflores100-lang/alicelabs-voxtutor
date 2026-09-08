/**
 * Capa de almacenamiento de VoxTutor para producción (Vercel).
 *
 * - Producción: Vercel Edge Config (envs: EDGE_CONFIG_ID + EDGE_CONFIG_TOKEN + EDGE_CONFIG_TEAM_ID)
 *   Probado en vivo contra la API de Edge Config:
 *     Upsert: PATCH /v1/edge-config/{id}/items  {"items":[{key,value,operation:"upsert"}]}
 *     Delete: PATCH /v1/edge-config/{id}/items  {"items":[{key,operation:"delete"}]}
 *     Read:   GET   /v1/edge-config/{id}/items  -> [{key,value,updatedAt}]
 *   Restricción: llaves solo [a-zA-Z0-9_-]
 *
 * - Local/demo sin envs: Map en memoria (los datos viven mientras corre el server).
 */

export type MemoryEntry = { key: string; value: string; updatedAt: number };
export type ChatRole = 'user' | 'tutor';
export type StoredMessage = {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  corrections: string | null;
  createdAt: number;
};

export type TutorState = {
  exists: boolean;
  memory: MemoryEntry[]; // desc por updatedAt
  history: StoredMessage[]; // asc (cronológico), últimos 10
  stage: number;
};

const EC_ID = process.env.EDGE_CONFIG_ID ?? '';
const EC_TOKEN = process.env.EDGE_CONFIG_TOKEN ?? '';
const EC_TEAM = process.env.EDGE_CONFIG_TEAM_ID ?? '';
const EC_BASE = 'https://api.vercel.com/v1/edge-config';

export const storeEnabled = Boolean(EC_ID && EC_TOKEN);

/* ---------- fallback local (globalThis: mismo singleton en todas las rutas) ---------- */
type LocalStore = {
  msgs: Map<string, StoredMessage>;
  mem: Map<string, MemoryEntry>;
  stages: Map<string, number>;
  sessions: Set<string>;
};
const g = globalThis as unknown as { __voxtutorLocal?: LocalStore };
const local: LocalStore = (g.__voxtutorLocal ??= {
  msgs: new Map(),
  mem: new Map(),
  stages: new Map(),
  sessions: new Set(),
});

/* ---------- helpers Edge Config ---------- */

function ecUrl(path: string): string {
  return `${EC_BASE}/${EC_ID}${path}${EC_TEAM ? `?teamId=${EC_TEAM}` : ''}`;
}

async function ecReadAll(): Promise<Array<{ key: string; value: string; updatedAt?: number }>> {
  const r = await fetch(ecUrl('/items'), {
    headers: { Authorization: `Bearer ${EC_TOKEN}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`edge-config read ${r.status}`);
  return (await r.json()) as Array<{ key: string; value: string; updatedAt?: number }>;
}

async function ecPatch(items: Array<Record<string, unknown>>): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(ecUrl('/items'), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${EC_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (r.ok) return;
    if (attempt === 0) await new Promise((res) => setTimeout(res, 400));
    else throw new Error(`edge-config write ${r.status}: ${await r.text()}`);
  }
}

function sanitize(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

function parseMsg(key: string, value: string): StoredMessage | null {
  try {
    const j = JSON.parse(value) as Omit<StoredMessage, 'id'> & { t?: number };
    return {
      id: key,
      sessionId: j.sessionId,
      role: j.role,
      content: String(j.content ?? '').slice(0, 900),
      corrections: j.corrections ?? null,
      createdAt: j.createdAt ?? j.t ?? 0,
    };
  } catch {
    return null;
  }
}

/* ---------- Estado por turno (1 sola lectura) ---------- */

export async function loadState(sessionId?: string): Promise<TutorState> {
  if (!storeEnabled) {
    const history = [...local.msgs.values()]
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-10);
    return {
      exists: sessionId ? local.sessions.has(sessionId) : false,
      memory: [...local.mem.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20),
      history,
      stage: sessionId ? local.stages.get(sessionId) ?? 0 : 0,
    };
  }

  let items: Array<{ key: string; value: string; updatedAt?: number }>;
  try {
    items = await ecReadAll();
  } catch (e) {
    // Degradación elegante: si Edge Config no responde, la app sigue (sin memoria persistida)
    console.warn('[store] lectura Edge Config falló, modo degradado:', e);
    items = [];
  }
  const memory: MemoryEntry[] = [];
  const allMsgs: StoredMessage[] = [];
  let stage = 0;
  let exists = false;

  for (const it of items) {
    if (it.key.startsWith('mem_')) {
      try {
        const m = JSON.parse(it.value) as { v: string; t: number };
        memory.push({ key: it.key.slice(4), value: m.v, updatedAt: m.t ?? 0 });
      } catch {}
    } else if (it.key.startsWith('msg_')) {
      const m = parseMsg(it.key, it.value);
      if (m) allMsgs.push(m);
    } else if (sessionId && it.key === `sess_${sessionId}`) {
      exists = true;
      try {
        stage = (JSON.parse(it.value) as { stage?: number }).stage ?? 0;
      } catch {}
    }
  }

  memory.sort((a, b) => b.updatedAt - a.updatedAt);
  const history = allMsgs
    .filter((m) => m.sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-10);

  return { exists, memory: memory.slice(0, 20), history, stage };
}

/* ---------- Sesiones ---------- */

export function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function createSession(id: string): Promise<void> {
  if (!storeEnabled) {
    local.sessions.add(id);
    local.stages.set(id, 0);
    return;
  }
  try {
    await ecPatch([{ key: `sess_${sanitize(id)}`, value: JSON.stringify({ stage: 0, ts: Date.now() }), operation: 'upsert' }]);
  } catch (e) {
    console.warn('[store] no se pudo crear sesión persistente:', e);
  }
}

/* ---------- Guardar el turno completo (1 sola escritura batch) ---------- */

export async function saveTurn(opts: {
  sessionId: string;
  stage: number;
  userText: string | null; // null en kickoff
  tutorReply: string;
  corrections: Array<{ wrong: string; right: string; note: string }>;
  memoryUpdates: Array<{ key: string; value: string }>;
}): Promise<void> {
  const { sessionId, stage, userText, tutorReply, corrections, memoryUpdates } = opts;
  const now = Date.now();
  const sid = sanitize(sessionId);

  if (!storeEnabled) {
    local.sessions.add(sessionId);
    local.stages.set(sessionId, stage);
    if (userText) {
      local.msgs.set(`msg_${sid}_${now}_u`, {
        id: `msg_${sid}_${now}_u`, sessionId, role: 'user', content: userText, corrections: null, createdAt: now,
      });
    }
    local.msgs.set(`msg_${sid}_${now}_t`, {
      id: `msg_${sid}_${now}_t`, sessionId, role: 'tutor', content: tutorReply,
      corrections: corrections.length ? JSON.stringify(corrections.slice(0, 2)) : null, createdAt: now + 1,
    });
    for (const u of memoryUpdates) {
      local.mem.set(`mem_${sanitize(u.key)}`, { key: u.key, value: u.value, updatedAt: now });
    }
    return;
  }

  const items: Array<Record<string, unknown>> = [];

  items.push({ key: `sess_${sid}`, value: JSON.stringify({ stage, ts: now }), operation: 'upsert' });

  if (userText) {
    items.push({
      key: `msg_${sid}_${now}_u`,
      value: JSON.stringify({ sessionId, role: 'user', content: userText.slice(0, 700), corrections: null, createdAt: now }),
      operation: 'upsert',
    });
  }
  items.push({
    key: `msg_${sid}_${now}_t`,
    value: JSON.stringify({
      sessionId, role: 'tutor', content: tutorReply.slice(0, 700),
      corrections: corrections.length ? JSON.stringify(corrections.slice(0, 2)) : null, createdAt: now + 1,
    }),
    operation: 'upsert',
  });

  for (const u of memoryUpdates) {
    if (!u.key || !u.value) continue;
    items.push({
      key: `mem_${sanitize(u.key)}`,
      value: JSON.stringify({ v: String(u.value).slice(0, 200), t: now }),
      operation: 'upsert',
    });
  }

  try {
    // Poda: mantener máx 30 mensajes por sesión (borra los más viejos en el mismo batch)
    const all = await ecReadAll();
    const sessionMsgs = all
      .filter((i) => i.key.startsWith(`msg_${sid}_`))
      .sort((a, b) => a.key.localeCompare(b.key));
    const excess = sessionMsgs.length + (userText ? 2 : 1) - 30;
    for (let i = 0; i < Math.min(excess, 10); i++) {
      items.push({ key: sessionMsgs[i].key, operation: 'delete' });
    }

    await ecPatch(items);
  } catch (e) {
    // El chat NUNCA debe fallar por storage; solo se pierde la persistencia
    console.warn('[store] escritura Edge Config falló, turno no persistido:', e);
  }
}

/* ---------- Memoria (para /api/memory) ---------- */

export async function getMemory(): Promise<MemoryEntry[]> {
  if (!storeEnabled) {
    return [...local.mem.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  let items: Array<{ key: string; value: string; updatedAt?: number }>;
  try {
    items = await ecReadAll();
  } catch (e) {
    console.warn('[store] lectura de memoria falló:', e);
    items = [];
  }
  const memory: MemoryEntry[] = [];
  for (const it of items) {
    if (!it.key.startsWith('mem_')) continue;
    try {
      const m = JSON.parse(it.value) as { v: string; t: number };
      memory.push({ key: it.key.slice(4), value: m.v, updatedAt: m.t ?? 0 });
    } catch {}
  }
  return memory.sort((a, b) => b.updatedAt - a.updatedAt);
}
