/**
 * Capa LLM provider-agnostic para el Nebius x NVIDIA Hackathon.
 * - Producción: NVIDIA Nemotron (open source) servido en Nebius Token Factory.
 *   → Requiere NEBIUS_API_KEY (créditos gratis al crear la cuenta).
 * - Demo local: fallback a z-ai-web-dev-sdk (sin claves).
 */

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

const NEBIUS_BASE = process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1';
const NEBIUS_MODEL = process.env.NEBIUS_MODEL ?? 'nvidia/llama-3.3-nemotron-super-49b-v1';

export async function llm(messages: ChatMsg[]): Promise<string> {
  const key = process.env.NEBIUS_API_KEY;
  if (key) return nebiusChat(messages, key);
  return zaiChat(messages);
}

/** Nebius Token Factory — API compatible con OpenAI */
async function nebiusChat(messages: ChatMsg[], key: string): Promise<string> {
  const res = await fetch(`${NEBIUS_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: NEBIUS_MODEL, messages, temperature: 0.6, max_tokens: 600 }),
  });
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

/** Fallback demo (sandbox): mismo contrato, otro proveedor */
async function zaiChat(messages: ChatMsg[]): Promise<string> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    thinking: { type: 'disabled' },
  } as never);
  return completion.choices[0]?.message?.content ?? '';
}
