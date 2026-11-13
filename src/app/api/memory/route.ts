import { NextRequest, NextResponse } from 'next/server';
import { loadState, isValidSessionId } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sessionId')?.trim() ?? '';
  const noStore = { headers: { 'Cache-Control': 'no-store' } };
  if (!sid) {
    return NextResponse.json({ memory: [], streak: 0, scenario: 'free', lastDiagnosis: null }, noStore);
  }
  if (!isValidSessionId(sid)) {
    return NextResponse.json({ error: 'sessionId inválido' }, { ...noStore, status: 400 });
  }
  const state = await loadState(sid);
  const streak = safeParse<{ last: string; count: number }>(state.meta.streak);
  const diagnosis = safeParse<Record<string, unknown>>(state.meta.diagnosis);
  return NextResponse.json({
    memory: state.memory.map((m) => ({ id: m.key, key: m.key, value: m.value })),
    streak: streak?.count ?? 0,
    scenario: safeParse<string>(state.meta.scenario) ?? 'free',
    lastDiagnosis: diagnosis ?? null,
  }, noStore);
}

function safeParse<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
