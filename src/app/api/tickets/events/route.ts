// src/app/api/tickets/events/route.ts
// Server-Sent Events para actualizaciones de tickets en tiempo real

import { NextRequest } from 'next/server';
import { ticketEvents, TicketUpdate } from '@/lib/ticketEvents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('user_id');

  // Crear el stream de eventos
  const encoder = new TextEncoder();
  let isConnected = true;

  const stream = new ReadableStream({
    start(controller) {
      console.log('[SSE] Nueva conexión establecida');

      // Enviar evento de conexión
      const connectEvent = `event: connected\ndata: ${JSON.stringify({ message: 'Conectado al stream de tickets' })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      // Suscribirse a los eventos de tickets
      const unsubscribe = ticketEvents.subscribe((update: TicketUpdate) => {
        if (!isConnected) return;

        try {
          const eventData = `event: ticket-update\ndata: ${JSON.stringify(update)}\n\n`;
          controller.enqueue(encoder.encode(eventData));
          console.log(`[SSE] Evento enviado para ticket ${update.ticketId}`);
        } catch (error) {
          console.error('[SSE] Error enviando evento:', error);
        }
      });

      // Heartbeat cada 30 segundos para mantener la conexión
      const heartbeatInterval = setInterval(() => {
        if (!isConnected) {
          clearInterval(heartbeatInterval);
          return;
        }
        try {
          const heartbeat = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`;
          controller.enqueue(encoder.encode(heartbeat));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup cuando se cierre la conexión
      request.signal.addEventListener('abort', () => {
        console.log('[SSE] Conexión cerrada');
        isConnected = false;
        unsubscribe();
        clearInterval(heartbeatInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Para nginx
    },
  });
}
