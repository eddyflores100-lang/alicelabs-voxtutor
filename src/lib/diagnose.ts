/**
 * Diagnóstico CEFR del estudiante — Deep Diagnostic Layer.
 *
 * - Con NEBIUS_API_KEY: análisis profundo con el modelo de razonamiento
 *   (NEBIUS_MODEL_DEEP, default Nemotron Ultra 253B) sobre todo el historial.
 * - Sin clave: evaluador heurístico local (estimación aproximada, sin llamadas).
 *
 * Salida idéntica en ambos modos:
 * { level, summary, patterns: [{pattern, count, advice}], roadmap: [{step, focus}], mode }
 */

import { nebiusAvailable, nebiusChat } from './llm';
import type { MemoryEntry, StoredMessage } from './store';

export type Diagnosis = {
  level: string;
  summary: string;
  patterns: Array<{ pattern: string; count: number; advice: string }>;
  roadmap: Array<{ step: string; focus: string }>;
  mode: 'nebius-deep' | 'local';
};

const DEEP_SYSTEM = `Eres un evaluador CEFR experto. Analiza la transcripción del estudiante de inglés (hispanohablante) y su memoria, y responde SOLO un JSON válido:
{
  "level": "A1|A2|B1|B2|C1 (el que mejor encaje)",
  "summary": "2-3 frases en español sobre su nivel real y su estilo",
  "patterns": [{ "pattern": "error -> forma correcta", "count": 1, "advice": "consejo breve en español" }],
  "roadmap": [{ "step": "Semana 1", "focus": "qué practicar y por qué (español)" }]
}
Reglas: 3-5 patterns (usa los errores reales de la transcripción/memoria; si no hay, usa debilidades típicas de su nivel), 4 roadmap steps concretos y accionables.`;

function localDiagnosis(memory: MemoryEntry[], history: StoredMessage[]): Diagnosis {
  const userMsgs = history.filter((m) => m.role === 'user');
  const words = userMsgs.reduce((n, m) => n + m.content.split(/\s+/).filter(Boolean).length, 0);
  const errPairs = (memory.find((m) => m.key === 'common_errors')?.value ?? '')
    .split(';')
    .map((p) => p.split('->').map((s) => s.trim()))
    .filter((p) => p.length === 2 && p[0] && p[1]);

  const errorCount = errPairs.length;
  const level =
    errorCount === 0
      ? words > 120 ? 'B1' : 'A2'
      : errorCount <= 2
        ? words > 80 ? 'A2–B1' : 'A2'
        : 'A1–A2';

  const patterns = errPairs.slice(0, 5).map(([wrong, right]) => ({
    pattern: `${wrong} -> ${right}`,
    count: 1,
    advice: 'Practica esta estructura en voz alta 5 veces hoy y reutilízala mañana en contexto.',
  }));

  const roadmap =
    errorCount > 3
      ? [
          { step: 'Semana 1', focus: 'Corregir los errores recurrentes: una estructura al día con 5 frases propias.' },
          { step: 'Semana 2', focus: 'Pasado simple vs. participios irregulares (los verbos que más te fallan).' },
          { step: 'Semana 3', focus: 'Escenario de entrevista: 3 respuestas STAR grabadas y autoevaluadas.' },
          { step: 'Semana 4', focus: 'Standup técnico: explica tu trabajo real en inglés 5 min sin leer.' },
        ]
      : [
          { step: 'Semana 1', focus: 'Ampliar vocabulario de tu meta con 10 palabras nuevas por día en contexto.' },
          { step: 'Semana 2', focus: 'Conectores (however, although, therefore) para subir de A2 a B1.' },
          { step: 'Semana 3', focus: 'Roleplay de viaje: situaciones largas sin recurrir al español.' },
          { step: 'Semana 4', focus: 'Diagnóstico nuevo: compara tu fluidez con la grabación de la semana 1.' },
        ];

  return {
    level,
    summary: `Sesión con ${userMsgs.length} turnos y ~${words} palabras habladas; ${errorCount} patrón(es) de error detectado(s). Estimación heurística local (agrega NEBIUS_API_KEY para el análisis profundo con Nemotron Ultra).`,
    patterns,
    roadmap,
    mode: 'local',
  };
}

export async function diagnose(memory: MemoryEntry[], history: StoredMessage[]): Promise<Diagnosis> {
  if (nebiusAvailable()) {
    try {
      const transcript = history
        .map((m) => `${m.role === 'tutor' ? 'TUTOR' : 'ESTUDIANTE'}: ${m.content}`)
        .join('\n');
      const mem = memory.map((m) => `- ${m.key}: ${m.value}`).join('\n') || '(vacía)';
      const raw = await nebiusChat(
        [
          { role: 'system', content: DEEP_SYSTEM },
          { role: 'user', content: `MEMORIA:\n${mem}\n\nTRANSCRIPCIÓN RECIENTE:\n${transcript || '(aún no hay turnos)'}` },
        ],
        { deep: true, maxTokens: 900 }
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const j = JSON.parse(match[0]) as Diagnosis;
        return {
          level: String(j.level ?? 'A2').slice(0, 8),
          summary: String(j.summary ?? '').slice(0, 500),
          patterns: Array.isArray(j.patterns) ? j.patterns.slice(0, 6) : [],
          roadmap: Array.isArray(j.roadmap) ? j.roadmap.slice(0, 6) : [],
          mode: 'nebius-deep',
        };
      }
    } catch (e) {
      console.warn('[diagnose] deep falló, uso heurístico local:', e);
    }
  }
  return localDiagnosis(memory, history);
}
