import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const memory = await db.memory.findMany({ orderBy: { updatedAt: 'desc' } });
  return NextResponse.json({ memory });
}
