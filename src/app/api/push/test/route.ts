// src/app/api/push/test/route.ts
// Endpoint de prueba para enviar push notifications manualmente
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { query } from '@/lib/db';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@chevyplan.com.ec';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userEmail, ticketId = 999, status = 'Resuelto', title = 'Ticket de prueba' } = body;

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Se requiere userEmail' },
        { status: 400 }
      );
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'VAPID keys no configuradas' },
        { status: 500 }
      );
    }

    // Obtener suscripciones del usuario (case-insensitive)
    const subscriptions = await query<{
      id: number;
      endpoint: string;
      p256dh_key: string;
      auth_key: string;
    }>(
      'SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE LOWER(user_email) = LOWER($1)',
      [userEmail]
    );

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: false,
        error: `No hay suscripciones push para ${userEmail}`,
        hint: 'El usuario debe hacer clic en el icono de campana para suscribirse'
      }, { status: 404 });
    }

    // Normalizar URL: quitar slash final de APP_URL y usar email en minúsculas
    const baseUrl = APP_URL.replace(/\/$/, '');
    const ticketUrl = `${baseUrl}/detalleticket?mail=${encodeURIComponent(userEmail.toLowerCase())}&idticket=${ticketId}`;

    // Usar timestamp para que cada notificación sea única y no reemplace a la anterior
    const notificationTag = `ticket-${ticketId}-${Date.now()}`;

    const payload = JSON.stringify({
      title: `Ticket #${ticketId}`,
      body: `${status} - ${title}`,
      icon: '/icons/icon-192x192.svg',
      badge: '/icons/icon-192x192.svg',
      tag: notificationTag,
      data: {
        ticketId,
        status,
        url: ticketUrl,
      },
      actions: [
        {
          action: 'view',
          title: 'Ver ticket',
        },
      ],
    });

    let sent = 0;
    let failed = 0;
    const results: { id: number; success: boolean; error?: string }[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key,
            },
          },
          payload
        );
        sent++;
        results.push({ id: sub.id, success: true });
      } catch (error: unknown) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({ id: sub.id, success: false, error: errorMsg });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Push notification enviada`,
      stats: { sent, failed, total: subscriptions.length },
      results,
    });

  } catch (error) {
    console.error('Error en push test:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// GET para ver las suscripciones de un usuario
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');

  if (!userEmail) {
    return NextResponse.json(
      { error: 'Se requiere userEmail como query param' },
      { status: 400 }
    );
  }

  const subscriptions = await query<{
    id: number;
    device_type: string;
    created_at: Date;
  }>(
    'SELECT id, device_type, created_at FROM push_subscriptions WHERE user_email = $1',
    [userEmail]
  );

  return NextResponse.json({
    userEmail,
    subscriptionCount: subscriptions.length,
    subscriptions,
  });
}
