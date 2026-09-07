import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { llm } from '@/lib/llm';
import { tutorSystemPrompt } from '@/lib/tutor';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, text } = await req.json();
    const isKickoff = text?.trim() === '[start]';
    if (!isKickoff && !text?.trim()) return NextResponse.json({ error: 'text requerido' }, { status: 400 });

    // 1. Sesión (auto-crea la por defecto)
    let id = sessionId as string | undefined;
    if (!id || !(await db.session.findUnique({ where: { id } }))) {
      id = (await db.session.create({ data: { title: 'Práctica principal' } })).id;
    }

    // 2. Memoria persistente + historial reciente
    const [memory, history] = await Promise.all([
      db.memory.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 }),
      db.message.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    // 3. Guarda lo que dijo el estudiante
    if (!isKickoff) {
      await db.message.create({ data: { sessionId: id, role: 'user', content: text } });
    }

    // 4. Llama al tutor (Nemotron en Nebius / fallback demo)
    const raw = await llm([
      { role: 'system', content: tutorSystemPrompt(memory) },
      ...history.reverse().map((m) => ({
        role: m.role === 'tutor' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      { role: 'user', content: isKickoff ? '(El estudiante acaba de abrir la app. Salúdalo en inglés simple, preséntate en una frase y pregúntale su nombre y para qué quiere mejorar su inglés.)' : text },
    ]);

    // 5. Parseo robusto del JSON del modelo
    const parsed = safeParse(raw);
    await db.message.create({
      data: {
        sessionId: id,
        role: 'tutor',
        content: parsed.reply,
        corrections: parsed.corrections.length ? JSON.stringify(parsed.corrections) : null,
      },
    });

    // 6. Persiste memoria nueva (upsert)
    for (const u of parsed.memoryUpdates) {
      if (!u.key || !u.value) continue;
      await db.memory.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      });
    }

    return NextResponse.json({ sessionId: id, reply: parsed.reply, corrections: parsed.corrections });
  } catch (e) {
    console.error('[chat]', e);
    return NextResponse.json({ error: 'Error del tutor', detail: String(e) }, { status: 500 });
  }
}

function safeParse(raw: string): { reply: string; corrections: { wrong: string; right: string; note: string }[]; memoryUpdates: { key: string; value: string }[] } {
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
