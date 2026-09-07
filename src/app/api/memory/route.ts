import { NextResponse } from 'next/server';
import { getMemory } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  const memory = await getMemory();
  return NextResponse.json({ memory: memory.map((m) => ({ id: m.key, key: m.key, value: m.value })) });
}
