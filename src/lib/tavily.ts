/**
 * Cliente de Tavily Search — contexto del mundo real para el tutor.
 *
 * "Best Use of Tavily" (Nebius x NVIDIA hackathon): cuando el estudiante practica
 * una entrevista ("interview for a Software Engineer at Amazon") o un viaje
 * ("I'm traveling to London"), VoxTutor busca datos REALES en la web y los
 * inyecta en el system prompt de Nemotron, para entrenar con situaciones
 * actuales, no genéricas.
 *
 * Sin TAVILY_API_KEY la app funciona igual (simplemente sin enriquecimiento web).
 */

const TAVILY_URL = 'https://api.tavily.com/search';

export type TavilyResult = { title: string; content: string };

export function tavilyAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** Búsqueda web básica; devuelve máx 3 snippets recortados. [] si falla o no hay clave. */
export async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: 3, search_depth: 'basic' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`tavily ${res.status}`);
    const j = (await res.json()) as { results?: Array<{ title?: string; content?: string }> };
    return (j.results ?? [])
      .slice(0, 3)
      .map((r) => ({ title: String(r.title ?? '').slice(0, 120), content: String(r.content ?? '').slice(0, 400) }))
      .filter((r) => r.content.length > 20);
  } catch (e) {
    console.warn('[tavily] búsqueda falló (se continúa sin contexto):', e);
    return [];
  }
}

/** Extrae entidad relevante del texto: empresa (tras "at X") o destino (tras "to X"). */
export function extractEntity(text: string): string | null {
  const company = text.match(/\b(?:at|for)\s+([A-Z][A-Za-z0-9&.\- ]{2,30})/);
  if (company) return company[1].trim().replace(/\s+(job|interview|next|soon|today|tomorrow)\b.*$/i, '').trim() || null;
  const dest = text.match(/\b(?:to|in)\s+((?:London|Madrid|Paris|New York|Berlin|Rome|Tokyo|Toronto|Dublin|Barcelona|Lima|Bogot|Buenos Aires|Santiago|Quito|Guayaquil|Miami|Chicago|Austin|Seattle|Amsterdam|Dubai|Singapore|Sydney)[A-Za-z]*)\b/i);
  if (dest) return dest[1];
  return null;
}

/** Query de búsqueda según escenario + entidad. */
export function buildQuery(scenario: string, entity: string | null, userText: string): string | null {
  if (scenario === 'interview') {
    const role = userText.match(/\b(software engineer|developer|designer|data scientist|product manager|devops|qa|marketing|sales|accountant|teacher|nurse)\b/i);
    return `${role ? role[1] : 'job'} interview questions ${entity ?? ''} 2025 tips`.trim();
  }
  if (scenario === 'travel') {
    return entity ? `${entity} travel tips for visitors what to know` : null;
  }
  return null; // standup y free no necesitan búsqueda web
}
