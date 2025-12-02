// src/app/api/push/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { query, execute } from '@/lib/db';

// Configurar VAPID
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@chevyplan.com.ec';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

// Mapeo de status GLPI a texto
const STATUS_MAP: Record<number, string> = {
  1: 'Nuevo',
  2: 'En Progreso (Asignado)',
  3: 'En Progreso (Planificado)',
  4: 'Pendiente',
  5: 'Resuelto',
  6: 'Cerrado',
};

// POST - Enviar notificación push a un usuario
export async function POST(request: NextRequest) {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('[Push Send] VAPID keys no configuradas');
      return NextResponse.json(
        { error: 'VAPID keys no configuradas' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userEmail, ticketId, ticketStatus, title, message } = body;

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Se requiere userEmail' },
        { status: 400 }
      );
    }

    // Obtener todas las suscripciones del usuario (case-insensitive)
    const subscriptions = await query<PushSubscriptionRecord>(
      `SELECT id, endpoint, p256dh_key, auth_key
       FROM push_subscriptions
       WHERE LOWER(user_email) = LOWER($1)`,
      [userEmail]
    );

    if (subscriptions.length === 0) {
      console.log(`[Push Send] No hay suscripciones para ${userEmail}`);
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No hay suscripciones registradas para este usuario'
      });
    }

    // Construir el payload de la notificación
    const statusText = ticketStatus ? (STATUS_MAP[ticketStatus] || `Estado ${ticketStatus}`) : '';
    const notificationTitle = title || `Ticket #${ticketId}`;
    const notificationBody = message || `${statusText ? `Estado: ${statusText}` : 'Tu ticket ha sido actualizado'}`;
    // Normalizar URL: quitar slash final de APP_URL y usar email en minúsculas
    const baseUrl = APP_URL.replace(/\/$/, '');
    const ticketUrl = `${baseUrl}/detalleticket?mail=${encodeURIComponent(userEmail.toLowerCase())}&idticket=${ticketId}`;

    const payload = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      icon: '/icons/icon-192x192.svg',
      badge: '/icons/icon-192x192.svg',
      tag: `ticket-${ticketId}`,
      data: {
        ticketId,
        ticketStatus,
        url: ticketUrl,
        userEmail
      },
      actions: [
        {
          action: 'open',
          title: 'Ver Ticket'
        }
      ]
    });

    console.log(`[Push Send] Enviando notificación a ${subscriptions.length} dispositivo(s) de ${userEmail}`);

    // Enviar a todos los dispositivos del usuario
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);

          // Actualizar last_used_at
          await execute(
            'UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1',
            [sub.id]
          );

          return { id: sub.id, success: true };
        } catch (error: unknown) {
          const pushError = error as { statusCode?: number };
          console.error(`[Push Send] Error enviando a suscripción ${sub.id}:`, error);

          // Si el error es 410 (Gone) o 404 (Not Found), eliminar la suscripción
          if (pushError.statusCode === 410 || pushError.statusCode === 404) {
            console.log(`[Push Send] Eliminando suscripción expirada ${sub.id}`);
            await execute('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
          }

          return { id: sub.id, success: false, error: pushError.statusCode };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success).length;
    const failed = results.length - successful;

    console.log(`[Push Send] Enviado: ${successful} exitosos, ${failed} fallidos`);

    return NextResponse.json({
      success: true,
      sent: successful,
      failed,
      total: subscriptions.length
    });

  } catch (error) {
    console.error('Error en push send:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
