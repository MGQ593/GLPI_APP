import { NextResponse } from 'next/server';

export async function GET() {
  // Valores por defecto: 10 minutos timeout, advertencia a los 8 minutos
  const timeoutMinutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '10', 10);
  const warningMinutes = parseInt(process.env.SESSION_WARNING_MINUTES || '8', 10);

  return NextResponse.json({
    session: {
      timeoutMinutes,
      warningMinutes,
      // También enviamos en milisegundos para facilitar el uso en setTimeout
      timeoutMs: timeoutMinutes * 60 * 1000,
      warningMs: warningMinutes * 60 * 1000,
    }
  });
}
