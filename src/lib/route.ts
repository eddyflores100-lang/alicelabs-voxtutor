import { NextRequest, NextResponse } from 'next/server';
import { loadState, createSession, newSessionId, saveTurn } from '@/lib/store';
import { nebiusAvailable, nebiusChat } from '@/lib/llm';
import { tutorSystemPrompt } from '@/lib/tutor';
import { localTutorTurn } from '@/lib/tutor-local';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, text } = await req.json();
    const isKickoff = text?.trim() === '[start]';
    if (!isKickoff && !text?.trim()) return NextResponse.json({ error: 'text requerido' }, { status: 400 });

    // 1. Estado (memoria + historial + etapa) con UNA lectura
    const state = await loadState(sessionId);

    // 2. Sesión
    let id = sessionId as string | undefined;
    if (!id || !state.exists) {
      id = newSessionId();
      await createSession(id);
    }

    // 3. Turno del tutor
    let parsed: {
      reply: string;
      corrections: Array<{ wrong: string; right: string; note: string }>;
      memoryUpdates: Array<{ key: string; value: string }>;
    };
    let mode: 'nebius' | 'local' = 'local';

    if (nebiusAvailable()) {
      mode = 'nebius';
      const kickoffInstruction =
        '(El estudiante acaba de abrir la app. Salúdalo en inglés simple, preséntate en una frase y pregúntale su nombre y para qué quiere mejorar su inglés.)';
      const raw = await nebiusChat([
        { role: 'system', content: tutorSystemPrompt(state.memory) },
        ...state.history.map((m) => ({
          role: m.role === 'tutor' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
        { role: 'user', content: isKickoff ? kickoffInstruction : text },
      ]);
      parsed = safeParse(raw);
    } else {
      parsed = localTutorTurn(isKickoff ? '[start]' : text, state.memory, state.stage);
    }

    // 4. Persistir el turno (batch: mensajes + memoria + etapa)
    await saveTurn({
      sessionId: id,
      stage: 'nextStage' in parsed ? (parsed as { nextStage?: number }).nextStage ?? state.stage : state.stage,
      userText: isKickoff ? null : String(text),
      tutorReply: parsed.reply,
      corrections: parsed.corrections,
      memoryUpdates: parsed.memoryUpdates,
    });

    return NextResponse.json({ sessionId: id, reply: parsed.reply, corrections: parsed.corrections, mode });
  } catch (e) {
    console.error('[chat]', e);
    return NextResponse.json({ error: 'Error del tutor', detail: String(e) }, { status: 500 });
  }
}

function safeParse(raw: string): {
  reply: string;
  corrections: Array<{ wrong: string; right: string; note: string }>;
  memoryUpdates: Array<{ key: string; value: string }>;
  nextStage?: number;
} {
  const fallback = { reply: raw.trim(), corrections: [], memoryUpdates: [] };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const j = JSON.parse(match[0]);
    return {
      reply: typeof j.reply === 'string' ? j.reply : raw.trim(),
      corrections: Array.isArray(j.corrections) ? j.corrections.slice(0, 3) : [],
      memoryUpdates: Array.isArray(j.memoryUpdates) ? j.memoryUpdates.slice(0, 5) : [],
    };
  } catch {
    return fallback;
  }
}
