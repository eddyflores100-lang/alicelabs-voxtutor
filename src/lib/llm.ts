/**
 * Capa LLM provider-agnostic para VoxTutor (by AliceLabs).
 * - Producción: NVIDIA Nemotron (open source) servido en Nebius Token Factory.
 *   → Requiere NEBIUS_API_KEY (créditos gratis al crear la cuenta).
 * - Sin clave: la ruta /api/chat usa el tutor heurístico local (tutor-local.ts).
 */

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

const NEBIUS_BASE = process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1';
const NEBIUS_MODEL = process.env.NEBIUS_MODEL ?? 'nvidia/llama-3.3-nemotron-super-49b-v1';

export function nebiusAvailable(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY);
}

export async function nebiusChat(messages: ChatMsg[], key?: string): Promise<string> {
  const k = key ?? process.env.NEBIUS_API_KEY;
  if (!k) throw new Error('NEBIUS_API_KEY no configurada');
  const res = await fetch(`${NEBIUS_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: NEBIUS_MODEL, messages, temperature: 0.6, max_tokens: 600 }),
  });
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}
