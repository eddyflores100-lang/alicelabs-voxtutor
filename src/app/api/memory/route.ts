import { NextRequest, NextResponse } from 'next/server';
import { getMemory } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sessionId') ?? undefined;
  const memory = await getMemory(sid);
  return NextResponse.json({ memory: memory.map((m) => ({ id: m.key, key: m.key, value: m.value })) });
}
