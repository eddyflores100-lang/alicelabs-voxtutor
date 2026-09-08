import { NextRequest, NextResponse } from 'next/server';
import { loadState, createSession, newSessionId, saveTurn } from '@/lib/store';
import { nebiusAvailable, nebiusChat, NEBIUS_MODEL_FAST, NEBIUS_MODEL_DEEP, type ChatMsg } from '@/lib/llm';
import { tutorSystemPrompt, type PromptScenario } from '@/lib/tutor';
import { localTutorTurn, isScenario, type Scenario } from '@/lib/tutor-local';
import { tavilyAvailable, tavilySearch, extractEntity, buildQuery } from '@/lib/tavily';

export const runtime = 'nodejs';

// Rate limit simple por sesión: protege Edge Config y créditos de Token Factory.
// 30 mensajes/minuto por sid (generoso para uso real; frena abuso y loops).
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
function rateLimited(sid: string): boolean {
  const hits = ((globalThis as { __vtHits?: Map<string, number[]> }).__vtHits ??= new Map<string, number[]>());
  const now = Date.now();
  const arr = (hits.get(sid) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) return true;
  arr.push(now);
  hits.set(sid, arr);
  return false;
}

const KICKOFF_INSTRUCTION =
  '(El estudiante acaba de abrir la app. Salúdalo en inglés simple, preséntate en una frase y pregúntale su nombre y para qué quiere mejorar su inglés.)';

function scenarioInstructionFor(s: Scenario): string {
  if (s === 'interview')
    return '(The student just switched to the MOCK JOB INTERVIEW scenario. Acknowledge it in one short sentence and start acting as a real interviewer with your first question.)';
  if (s === 'travel')
    return '(The student just switched to the TRAVEL & DAILY LIFE scenario. Acknowledge it in one short sentence and start with a realistic travel situation roleplay.)';
  if (s === 'standup')
    return '(The student just switched to the TECH DAILY STANDUP scenario. Acknowledge it in one short sentence and start the standup with your first question.)';
  return '(The student switched back to FREE CONVERSATION mode. Acknowledge briefly and ask a natural follow-up question.)';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextStreak(prev: { last?: string; count?: number } | undefined): { last: string; count: number } {
  const today = todayStr();
  if (prev?.last === today) return { last: today, count: Math.max(prev.count ?? 1, 1) };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (prev?.last === yesterday) return { last: today, count: (prev.count ?? 0) + 1 };
  return { last: today, count: 1 };
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, text, scenario } = await req.json();
    const isKickoff = text?.trim() === '[start]';
    const isScenarioSwitch = text?.trim() === '[scenario]';
    if (!isKickoff && !isScenarioSwitch && !text?.trim())
      return NextResponse.json({ error: 'text requerido' }, { status: 400 });

    const limiterKey = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : 'anon';
    if (rateLimited(limiterKey))
      return NextResponse.json(
        { error: 'Demasiados mensajes — espera un minuto. / Too many messages — please wait a minute.' },
        { status: 429 }
      );

    const sc: Scenario = isScenario(scenario) ? scenario : 'free';

    // 1. Estado (memoria + historial + etapa + meta) con UNA lectura
    const state = await loadState(sessionId);

    // 2. Sesión: el cliente manda un id estable (localStorage → memoria por navegador);
    //    solo generamos uno nuevo si falta o es inválido.
    const clientSid = typeof sessionId === 'string' ? sessionId.trim() : '';
    let id: string;
    if (/^[a-zA-Z0-9_-]{6,64}$/.test(clientSid)) {
      id = clientSid;
    } else {
      id = newSessionId();
      await createSession(id);
    }

    // 3. Contexto web en vivo (Tavily) — solo en la ruta Nemotron, con caché por sesión
    let webContext: string[] | undefined;
    const prevTavily = safeParse<Record<string, unknown>>(state.meta.tavily);
    const needsSearch =
      nebiusAvailable() &&
      tavilyAvailable() &&
      !isKickoff &&
      (isScenarioSwitch || sc !== 'free') &&
      sc !== 'standup';
    let tavilyCache: Record<string, unknown> | undefined;
    if (needsSearch) {
      const entity = extractEntity(text ?? '');
      const prevEntity = typeof prevTavily?.entity === 'string' ? prevTavily.entity : '';
      const prevScenario = typeof prevTavily?.scenario === 'string' ? prevTavily.scenario : '';
      if (isScenarioSwitch || entity !== prevEntity || sc !== prevScenario) {
        const query = buildQuery(sc, entity, text ?? '');
        if (query) {
          const results = await tavilySearch(query);
          if (results.length) webContext = results.map((r) => `${r.title}: ${r.content}`);
          tavilyCache = { scenario: sc, entity: entity ?? '', count: results.length, ts: Date.now() };
        }
      }
    }

    // 4. Turno del tutor
    let parsed: {
      reply: string;
      corrections: Array<{ wrong: string; right: string; note: string }>;
      memoryUpdates: Array<{ key: string; value: string }>;
    };
    let mode: 'nebius' | 'local' = 'local';
    let usedModel: string | undefined;

    if (nebiusAvailable()) {
      let userContent: string;
      if (isKickoff) userContent = KICKOFF_INSTRUCTION;
      else if (isScenarioSwitch) userContent = scenarioInstructionFor(sc);
      else userContent = text;

      const msgs: ChatMsg[] = [
        { role: 'system', content: tutorSystemPrompt(state.memory, sc as PromptScenario, webContext) },
        ...state.history.map((m) => ({
          role: m.role === 'tutor' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
        { role: 'user', content: userContent },
      ];

      try {
        mode = 'nebius';
        const { text: raw, model } = await nebiusChat(msgs);
        usedModel = model;
        parsed =
          safeParse<{ reply: string; corrections: Array<{ wrong: string; right: string; note: string }>; memoryUpdates: Array<{ key: string; value: string }> }>(raw) ??
          { reply: raw.trim(), corrections: [], memoryUpdates: [] };
      } catch (e) {
        // Degradación elegante: si Token Factory falla (red, cuota, modelo),
        // el tutor heurístico responde y el usuario nunca ve un error.
        console.error('[chat] nebius falló, uso tutor local:', e);
        mode = 'local';
        parsed = localTutorTurn(isKickoff ? '[start]' : isScenarioSwitch ? '[scenario]' : text, state.memory, state.stage, sc);
      }
    } else {
      parsed = localTutorTurn(isKickoff ? '[start]' : isScenarioSwitch ? '[scenario]' : text, state.memory, state.stage, sc);
    }

    // 5. Racha de práctica (meta persistente por sesión)
    const prevStreak = safeParse<{ last?: string; count?: number }>(state.meta.streak);
    const streak = nextStreak(prevStreak);

    // 6. Persistir el turno (batch: mensajes + memoria + etapa + meta)
    await saveTurn({
      sessionId: id,
      stage: 'nextStage' in parsed ? (parsed as { nextStage?: number }).nextStage ?? state.stage : state.stage,
      userText: isKickoff || isScenarioSwitch ? null : String(text),
      tutorReply: parsed.reply,
      corrections: parsed.corrections,
      memoryUpdates: parsed.memoryUpdates,
      meta: { scenario: sc, streak, ...(tavilyCache ? { tavily: tavilyCache } : {}) },
    });

    return NextResponse.json({ sessionId: id, reply: parsed.reply, corrections: parsed.corrections, mode, model: usedModel, scenario: sc, streak });
  } catch (e) {
    console.error('[chat]', e);
    return NextResponse.json({ error: 'Error del tutor', detail: String(e) }, { status: 500 });
  }
}

function safeParse<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return undefined;
  }
}
