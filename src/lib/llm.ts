/**
 * Capa LLM provider-agnostic para VoxTutor (by AliceLabs).
 *
 * Multi-Model Routing (Nemotron 3 family, recomendada por el track Best Apps & Agents:
 * "let Nano or Super handle the fast, everyday calls... Reach for Nemotron 3 Ultra
 * when you need serious reasoning"):
 * - Fast Voice Layer  → NEBIUS_MODEL_FAST  (default: Nemotron-3-Nano-30B-A3B, 3B activos) — turnos de voz, latencia mínima.
 * - Deep Diagnostic   → NEBIUS_MODEL_DEEP  (default: Nemotron-3-Ultra-550B-A55B)      — diagnóstico CEFR y planes de estudio.
 * Ambos apuntan a Nebius Token Factory (NEBIUS_API_KEY). Sobrescribibles por env.
 *
 * Resiliencia:
 * - Si el modelo primario falla con error de modelo (400/404), se reintenta UNA vez con el
 *   modelo legacy (llama-3.3-nemotron-super / llama-3.1-nemotron-ultra).
 * - Sin clave o con errores de red: /api/chat y /api/diagnosis degradan a los tutores
 *   heurísticos locales (tutor-local.ts / diagnose.ts). El chat NUNCA se cae.
 */

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

const NEBIUS_BASE = process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1';

/** Capa rápida de voz — Nemotron 3 Nano (30B total / 3B activos, 262K ctx, multilingüe). */
export const NEBIUS_MODEL_FAST =
  process.env.NEBIUS_MODEL_FAST ?? process.env.NEBIUS_MODEL ?? 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
/** Capa profunda de razonamiento — Nemotron 3 Ultra (550B total / 55B activos, 256K ctx). */
export const NEBIUS_MODEL_DEEP =
  process.env.NEBIUS_MODEL_DEEP ?? 'nvidia/Nemotron-3-Ultra-550b-a55b';
/** Modelos legacy de respaldo si el primario no está disponible en la cuenta/región. */
const LEGACY_FAST = 'nvidia/llama-3.3-nemotron-super-49b-v1';
const LEGACY_DEEP = 'nvidia/llama-3.1-nemotron-ultra-253b-v1';

export function nebiusAvailable(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY);
}

async function callModel(model: string, k: string, messages: ChatMsg[], maxTokens: number): Promise<string> {
  const res = await fetch(`${NEBIUS_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = new Error(`Nebius ${res.status} (${model}): ${await res.text()}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

export async function nebiusChat(
  messages: ChatMsg[],
  opts?: { deep?: boolean; key?: string; maxTokens?: number }
): Promise<{ text: string; model: string }> {
  const k = opts?.key ?? process.env.NEBIUS_API_KEY;
  if (!k) throw new Error('NEBIUS_API_KEY no configurada');
  const primary = opts?.deep ? NEBIUS_MODEL_DEEP : NEBIUS_MODEL_FAST;
  const legacy = opts?.deep ? LEGACY_DEEP : LEGACY_FAST;
  const maxTokens = opts?.maxTokens ?? 600;
  try {
    return { text: await callModel(primary, k, messages, maxTokens), model: primary };
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    // Solo reintentamos con el legacy ante errores "este modelo no existe/aquí no"
    if (status === 400 || status === 404) {
      return { text: await callModel(legacy, k, messages, maxTokens), model: legacy };
    }
    throw e;
  }
}
