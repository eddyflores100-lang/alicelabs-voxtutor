import { NextRequest, NextResponse } from 'next/server';
import { loadState, saveMeta, isValidSessionId } from '@/lib/store';
import { isRateLimited } from '@/lib/rate-limit';
import { diagnose } from '@/lib/diagnose';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const noStore = { headers: { 'Cache-Control': 'no-store' } };
    if (!isValidSessionId(sessionId))
      return NextResponse.json({ error: 'sessionId inválido' }, { ...noStore, status: 400 });
    if (isRateLimited('diagnosis:' + sessionId, 5, 60_000))
      return NextResponse.json({ error: 'Demasiados diagnósticos. Espera un minuto.' }, { ...noStore, status: 429 });

    const state = await loadState(sessionId);
    const diagnosis = await diagnose(state.memory, state.history);

    // Guardar el último diagnóstico en meta (aparece al recargar)
    await saveMeta(sessionId, { diagnosis: { ...diagnosis, ts: Date.now() } });

    return NextResponse.json(diagnosis, noStore);
  } catch (e) {
    console.error('[diagnosis]', e);
    return NextResponse.json({ error: 'Error del diagnóstico' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
