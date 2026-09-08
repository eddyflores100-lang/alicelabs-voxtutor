/**
 * Capa LLM provider-agnostic para VoxTutor (by AliceLabs).
 *
 * Multi-Model Routing (arquitectura recomendada por NVIDIA/Nebius):
 * - Fast Voice Layer  → NEBIUS_MODEL_FAST  (default: Nemotron Super 49B) — turnos de voz, baja latencia.
 * - Deep Diagnostic   → NEBIUS_MODEL_DEEP  (default: Nemotron Ultra 253B) — diagnóstico CEFR y planes de estudio.
 * Ambos apuntan a Nebius Token Factory (NEBIUS_API_KEY). Sobrescribibles por env si el catálogo cambia.
 *
 * - Sin clave: la ruta /api/chat usa el tutor heurístico local (tutor-local.ts) y
 *   /api/diagnosis un evaluador CEFR heurístico (diagnose.ts).
 */

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

const NEBIUS_BASE = process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1';
export const NEBIUS_MODEL_FAST =
  process.env.NEBIUS_MODEL_FAST ?? process.env.NEBIUS_MODEL ?? 'nvidia/llama-3.3-nemotron-super-49b-v1';
export const NEBIUS_MODEL_DEEP =
  process.env.NEBIUS_MODEL_DEEP ?? 'nvidia/llama-3.1-nemotron-ultra-253b-v1';

export function nebiusAvailable(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY);
}

export async function nebiusChat(messages: ChatMsg[], opts?: { deep?: boolean; key?: string; maxTokens?: number }): Promise<string> {
  const k = opts?.key ?? process.env.NEBIUS_API_KEY;
  if (!k) throw new Error('NEBIUS_API_KEY no configurada');
  const model = opts?.deep ? NEBIUS_MODEL_DEEP : NEBIUS_MODEL_FAST;
  const res = await fetch(`${NEBIUS_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: opts?.maxTokens ?? 600 }),
  });
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}
