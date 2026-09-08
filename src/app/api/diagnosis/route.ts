import { NextRequest, NextResponse } from 'next/server';
import { loadState, saveMeta } from '@/lib/store';
import { diagnose } from '@/lib/diagnose';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(sessionId.trim()))
      return NextResponse.json({ error: 'sessionId inválido' }, { status: 400 });

    const state = await loadState(sessionId.trim());
    const diagnosis = await diagnose(state.memory, state.history);

    // Guardar el último diagnóstico en meta (aparece al recargar)
    await saveMeta(sessionId.trim(), { diagnosis: { ...diagnosis, ts: Date.now() } });

    return NextResponse.json(diagnosis);
  } catch (e) {
    console.error('[diagnosis]', e);
    return NextResponse.json({ error: 'Error del diagnóstico', detail: String(e) }, { status: 500 });
  }
}
