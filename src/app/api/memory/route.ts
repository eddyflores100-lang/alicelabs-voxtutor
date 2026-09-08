import { NextRequest, NextResponse } from 'next/server';
import { loadState } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sessionId') ?? undefined;
  const state = await loadState(sid);
  const streak = safeParse<{ last: string; count: number }>(state.meta.streak);
  const diagnosis = safeParse<Record<string, unknown>>(state.meta.diagnosis);
  return NextResponse.json({
    memory: state.memory.map((m) => ({ id: m.key, key: m.key, value: m.value })),
    streak: streak?.count ?? 0,
    scenario: state.meta.scenario ? JSON.parse(state.meta.scenario) : 'free',
    lastDiagnosis: diagnosis ?? null,
  });
}

function safeParse<T>(raw: unknown): T | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
