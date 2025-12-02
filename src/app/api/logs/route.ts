// src/app/api/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'dev-logs.txt');

export async function POST(request: NextRequest) {
  try {
    const { level, message, data, timestamp } = await request.json();

    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}\n`;

    await fs.appendFile(LOG_FILE, logLine);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing log:', error);
    return NextResponse.json({ error: 'Failed to write log' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const logs = await fs.readFile(LOG_FILE, 'utf-8');
    return new NextResponse(logs, { headers: { 'Content-Type': 'text/plain' } });
  } catch {
    return new NextResponse('No logs yet', { headers: { 'Content-Type': 'text/plain' } });
  }
}

export async function DELETE() {
  try {
    await fs.writeFile(LOG_FILE, '');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to clear logs' }, { status: 500 });
  }
}
