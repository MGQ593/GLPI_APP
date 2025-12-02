// src/app/api/webhook/glpi/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ticketEvents, TicketUpdate } from '@/lib/ticketEvents';
import webpush from 'web-push';
import { query, execute } from '@/lib/db';

// Configurar VAPID para web-push
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@chevyplan.com.ec';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Nombres legibles para estados
const STATUS_DISPLAY_NAMES: Record<number, string> = {
  1: 'Nuevo',
  2: 'En Progreso (Asignado)',
  3: 'En Progreso (Planificado)',
  4: 'Pendiente',
  5: 'Resuelto',
  6: 'Cerrado',
};

// Función para enviar push notifications a un usuario por email
async function sendPushNotificationToUser(
  userEmail: string,
  ticketId: number,
  statusCode: number | undefined,
  ticketTitle?: string
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[Webhook GLPI] VAPID keys no configuradas, omitiendo push notification');
    return { sent: 0, failed: 0 };
  }

  try {
    // Obtener todas las suscripciones del usuario (case-insensitive)
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
      console.log(`[Webhook GLPI] No hay suscripciones push para ${userEmail}`);
      return { sent: 0, failed: 0 };
    }

    console.log(`[Webhook GLPI] Enviando push a ${subscriptions.length} dispositivo(s) de ${userEmail}`);

    // Preparar el payload de la notificación
    const statusText = statusCode ? STATUS_DISPLAY_NAMES[statusCode] || `Estado ${statusCode}` : 'Actualizado';
    const ticketUrl = `${APP_URL}/detalleticket?mail=${encodeURIComponent(userEmail)}&idticket=${ticketId}`;

    const payload = JSON.stringify({
      title: `Ticket #${ticketId}`,
      body: ticketTitle
        ? `${statusText} - ${ticketTitle.substring(0, 50)}${ticketTitle.length > 50 ? '...' : ''}`
        : `Estado: ${statusText}`,
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      tag: `ticket-${ticketId}`,
      data: {
        ticketId,
        status: statusCode,
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
    const expiredEndpoints: number[] = [];

    // Enviar a cada suscripción
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
        console.log(`[Webhook GLPI] Push enviado a endpoint ${sub.id}`);
      } catch (pushError: unknown) {
        failed++;
        const error = pushError as { statusCode?: number };
        console.error(`[Webhook GLPI] Error enviando push a endpoint ${sub.id}:`, pushError);

        // Si el endpoint ya no es válido (410 Gone o 404), marcarlo para eliminar
        if (error.statusCode === 410 || error.statusCode === 404) {
          expiredEndpoints.push(sub.id);
        }
      }
    }

    // Eliminar endpoints expirados
    if (expiredEndpoints.length > 0) {
      console.log(`[Webhook GLPI] Eliminando ${expiredEndpoints.length} suscripciones expiradas`);
      await execute(
        'DELETE FROM push_subscriptions WHERE id = ANY($1)',
        [expiredEndpoints]
      );
    }

    return { sent, failed };
  } catch (error) {
    console.error('[Webhook GLPI] Error en sendPushNotificationToUser:', error);
    return { sent: 0, failed: 0 };
  }
}

// Mapeo de estados de GLPI (código numérico -> etiqueta)
const STATUS_MAP: Record<number, string> = {
  1: 'nuevo',
  2: 'en-progreso',
  3: 'en-progreso',
  4: 'pendiente',
  5: 'resuelto',
  6: 'cerrado',
};

// Mapeo de texto de estado (español) -> código numérico
const STATUS_TEXT_MAP: Record<string, number> = {
  'nuevo': 1,
  'new': 1,
  'en curso': 2,
  'en curso (asignada)': 2,
  'en curso (planificada)': 3,
  'en progreso': 2,
  'in progress': 2,
  'assigned': 2,
  'planned': 3,
  'en espera': 4,
  'pendiente': 4,
  'pending': 4,
  'waiting': 4,
  'resuelto': 5,
  'solucionado': 5,
  'solved': 5,
  'cerrado': 6,
  'closed': 6,
};

// Mapeo de prioridades de GLPI
const PRIORITY_MAP: Record<number, string> = {
  1: 'muy-baja',
  2: 'baja',
  3: 'media',
  4: 'alta',
  5: 'muy-alta',
  6: 'mayor',
};

// Función para convertir texto de estado a código numérico
function getStatusCodeFromText(statusText: string): number | undefined {
  const normalizedText = statusText.toLowerCase().trim();
  // Buscar coincidencia exacta primero
  if (STATUS_TEXT_MAP[normalizedText] !== undefined) {
    return STATUS_TEXT_MAP[normalizedText];
  }
  // Buscar coincidencia parcial
  for (const [key, value] of Object.entries(STATUS_TEXT_MAP)) {
    if (normalizedText.includes(key) || key.includes(normalizedText)) {
      return value;
    }
  }
  return undefined;
}

// Función para decodificar entidades HTML
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&#60;': '<',
    '&#62;': '>',
    '&#38;': '&',
    '&#34;': '"',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.split(entity).join(char);
  }
  return decoded;
}

// Función para limpiar HTML y obtener texto plano
function stripHtml(html: string): string {
  // Primero decodificar entidades HTML (para convertir &lt;p&gt; en <p>)
  let text = decodeHtmlEntities(html);

  // Reemplazar etiquetas comunes de párrafo/salto con espacios
  text = text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<p[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ');

  // Eliminar todas las demás etiquetas HTML
  text = text.replace(/<[^>]+>/g, '');

  // Limpiar espacios múltiples y trim
  return text.replace(/\s+/g, ' ').trim();
}

// Función para obtener datos completos del ticket desde GLPI API
async function fetchTicketFromGLPI(ticketId: number): Promise<{ ticket: Record<string, unknown>; lastFollowup: string | null; requesterEmail: string | null } | null> {
  try {
    const GLPI_URL = process.env.GLPI_REST_API_URL;
    const APP_TOKEN = process.env.GLPI_APP_TOKEN;
    const USER_TOKEN = process.env.GLPI_USER_TOKEN;

    if (!GLPI_URL || !APP_TOKEN || !USER_TOKEN) {
      console.log('[Webhook GLPI] Variables de entorno de GLPI no configuradas');
      return null;
    }

    // Iniciar sesión en GLPI
    const sessionResponse = await fetch(`${GLPI_URL}/initSession`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': APP_TOKEN,
        'Authorization': `user_token ${USER_TOKEN}`,
      },
    });

    if (!sessionResponse.ok) {
      console.error('[Webhook GLPI] Error iniciando sesión en GLPI:', sessionResponse.status);
      return null;
    }

    const sessionData = await sessionResponse.json();
    const sessionToken = sessionData.session_token;

    // Obtener datos del ticket
    const ticketResponse = await fetch(`${GLPI_URL}/Ticket/${ticketId}?expand_dropdowns=true`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': APP_TOKEN,
        'Session-Token': sessionToken,
      },
    });

    if (!ticketResponse.ok) {
      console.error('[Webhook GLPI] Error obteniendo ticket:', ticketResponse.status);
      // Cerrar sesión
      await fetch(`${GLPI_URL}/killSession`, {
        method: 'GET',
        headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken },
      });
      return null;
    }

    const ticketData = await ticketResponse.json();
    console.log('[Webhook GLPI] Datos del ticket obtenidos:', JSON.stringify(ticketData, null, 2));

    // Obtener el último seguimiento (ITILFollowup) del ticket
    let lastFollowup: string | null = null;
    try {
      const followupResponse = await fetch(
        `${GLPI_URL}/Ticket/${ticketId}/ITILFollowup?order=DESC&range=0-0`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'App-Token': APP_TOKEN,
            'Session-Token': sessionToken,
          },
        }
      );

      if (followupResponse.ok) {
        const followups = await followupResponse.json();
        console.log('[Webhook GLPI] Followups obtenidos:', JSON.stringify(followups, null, 2));

        if (Array.isArray(followups) && followups.length > 0) {
          // El primer elemento es el más reciente (ordenado DESC)
          const latestFollowup = followups[0];
          if (latestFollowup.content) {
            lastFollowup = stripHtml(latestFollowup.content);
            console.log('[Webhook GLPI] Último followup:', lastFollowup);
          }
        }
      } else {
        console.log('[Webhook GLPI] No se pudieron obtener followups:', followupResponse.status);
      }
    } catch (followupError) {
      console.error('[Webhook GLPI] Error obteniendo followups:', followupError);
    }

    // Obtener el email del solicitante (requester) desde Ticket_User
    let requesterEmail: string | null = null;
    try {
      // Buscar los usuarios relacionados al ticket con tipo 1 (requester)
      const ticketUsersResponse = await fetch(
        `${GLPI_URL}/Ticket/${ticketId}/Ticket_User`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'App-Token': APP_TOKEN,
            'Session-Token': sessionToken,
          },
        }
      );

      if (ticketUsersResponse.ok) {
        const ticketUsers = await ticketUsersResponse.json();
        console.log('[Webhook GLPI] Ticket_User obtenidos:', JSON.stringify(ticketUsers, null, 2));

        // Filtrar por type = 1 (Requester)
        // type: 1 = Requester, 2 = Assigned to, 3 = Observer
        const requesters = Array.isArray(ticketUsers)
          ? ticketUsers.filter((tu: { type: number }) => tu.type === 1)
          : [];

        if (requesters.length > 0) {
          const requesterId = requesters[0].users_id;

          // Obtener datos del usuario para conseguir el email
          const userResponse = await fetch(
            `${GLPI_URL}/User/${requesterId}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
              },
            }
          );

          if (userResponse.ok) {
            const userData = await userResponse.json();
            console.log('[Webhook GLPI] Usuario solicitante:', JSON.stringify(userData, null, 2));

            // El email puede estar en 'email' o necesitamos buscarlo en UserEmail
            if (userData.email) {
              requesterEmail = userData.email;
            } else {
              // Buscar en UserEmail si el usuario tiene emails registrados
              const userEmailResponse = await fetch(
                `${GLPI_URL}/User/${requesterId}/UserEmail`,
                {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'App-Token': APP_TOKEN,
                    'Session-Token': sessionToken,
                  },
                }
              );

              if (userEmailResponse.ok) {
                const userEmails = await userEmailResponse.json();
                if (Array.isArray(userEmails) && userEmails.length > 0) {
                  // Tomar el primer email (o el que esté marcado como default)
                  const defaultEmail = userEmails.find((e: { is_default: number }) => e.is_default === 1);
                  requesterEmail = (defaultEmail || userEmails[0])?.email || null;
                }
              }
            }

            console.log('[Webhook GLPI] Email del solicitante:', requesterEmail);
          }
        }
      }
    } catch (userError) {
      console.error('[Webhook GLPI] Error obteniendo usuario solicitante:', userError);
    }

    // Cerrar sesión
    await fetch(`${GLPI_URL}/killSession`, {
      method: 'GET',
      headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken },
    });

    return { ticket: ticketData, lastFollowup, requesterEmail };

  } catch (error) {
    console.error('[Webhook GLPI] Error consultando GLPI API:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  let rawBody = '';
  try {
    console.log('[Webhook GLPI] Request recibido');
    console.log('[Webhook GLPI] Content-Type:', request.headers.get('content-type'));

    // Leer el body como texto primero para debugging
    rawBody = await request.text();
    console.log('[Webhook GLPI] Raw body:', rawBody);

    // Si el body está vacío, retornar error claro
    if (!rawBody || rawBody.trim() === '') {
      console.log('[Webhook GLPI] Body vacío recibido');
      return NextResponse.json({
        success: false,
        error: 'Body vacío',
        message: 'El webhook fue recibido pero sin datos'
      }, { status: 400 });
    }

    // Intentar parsear como JSON primero
    let body: Record<string, unknown> = {};
    let ticketId: number | null = null;

    // Verificar si es JSON o texto plano
    const trimmedBody = rawBody.trim();

    // Buscar JSON embebido en el texto (puede haber espacios al inicio)
    const jsonMatch = rawBody.match(/\{[\s\S]*\}/);
    const potentialJson = jsonMatch ? jsonMatch[0] : trimmedBody;

    if (potentialJson.startsWith('{') || potentialJson.startsWith('[')) {
      // Intentar parsear como JSON
      try {
        body = JSON.parse(potentialJson);
        console.log('[Webhook GLPI] Payload JSON parseado:', JSON.stringify(body, null, 2));

        // Formato esperado de GLPI con template personalizado:
        // { "evento": "...", "ticket": { "id": "123", ... }, ... }
        const ticket = body.ticket as Record<string, unknown> | undefined;
        if (ticket) {
          ticketId = Number(ticket.id);
          // Mapear campos del template GLPI
          body.status = ticket.estado_db || ticket.estado;
          body.statusText = ticket.estado as string;
          body.priority = ticket.prioridad;
          body.content = ticket.descripcion;
          body.date_mod = ticket.fecha_creacion;
          console.log('[Webhook GLPI] Ticket ID desde template:', ticketId);
        } else {
          // Formato alternativo directo
          ticketId = Number(body.id || body.ticket_id || body.items_id);
        }
      } catch (parseError) {
        console.log('[Webhook GLPI] No es JSON válido, parseando como texto...');
      }
    }

    // Si no es JSON o no tiene ticketId, intentar extraer del texto plano
    if (!ticketId) {
      console.log('[Webhook GLPI] Intentando parsear como texto plano...');

      // Buscar patrones comunes en el texto de GLPI
      // Patrón: "URL : ...Ticket...id=123" o similar
      const urlMatch = rawBody.match(/[?&]id=(\d+)/);
      if (urlMatch) {
        ticketId = Number(urlMatch[1]);
        console.log('[Webhook GLPI] ID extraído de URL:', ticketId);
      }

      // Patrón: "#123" o "Ticket #123"
      const hashMatch = rawBody.match(/#(\d+)/);
      if (!ticketId && hashMatch) {
        ticketId = Number(hashMatch[1]);
        console.log('[Webhook GLPI] ID extraído de #:', ticketId);
      }

      // Patrón: "Ticket 123" o "Caso 123"
      const ticketMatch = rawBody.match(/(?:Ticket|Caso|Case)\s*[:#]?\s*(\d+)/i);
      if (!ticketId && ticketMatch) {
        ticketId = Number(ticketMatch[1]);
        console.log('[Webhook GLPI] ID extraído de texto:', ticketId);
      }

      // Patrón: "ID : 123" o "ID: 123"
      const idMatch = rawBody.match(/\bID\s*:\s*(\d+)/i);
      if (!ticketId && idMatch) {
        ticketId = Number(idMatch[1]);
        console.log('[Webhook GLPI] ID extraído de campo ID:', ticketId);
      }

      // Patrón: "Número : 123" o "Numero: 123"
      const numeroMatch = rawBody.match(/N[úu]mero\s*:\s*(\d+)/i);
      if (!ticketId && numeroMatch) {
        ticketId = Number(numeroMatch[1]);
        console.log('[Webhook GLPI] ID extraído de Número:', ticketId);
      }

      // Patrón: buscar cualquier número después de "ticket" o "caso" en la URL o texto
      const genericTicketMatch = rawBody.match(/(?:ticket|caso|case)[^\d]*(\d+)/i);
      if (!ticketId && genericTicketMatch) {
        ticketId = Number(genericTicketMatch[1]);
        console.log('[Webhook GLPI] ID extraído de patrón genérico:', ticketId);
      }

      // Extraer estado si está presente (formato "Estados : En espera")
      const statusMatch = rawBody.match(/(?:Estados?|Status|State)\s*:\s*(.+?)(?:\r?\n|$)/i);
      if (statusMatch) {
        body.statusText = statusMatch[1].trim();
        console.log('[Webhook GLPI] Estado extraído:', body.statusText);
      }

      // Extraer título para referencia
      const tituloMatch = rawBody.match(/T[ií]tulo\s*:\s*(.+?)(?:\r?\n|$)/i);
      if (tituloMatch) {
        body.titulo = tituloMatch[1].trim();
        console.log('[Webhook GLPI] Título extraído:', body.titulo);
      }

      // Extraer técnicos asignados del texto plano
      const tecnicosMatch = rawBody.match(/Asignado a t[ée]cnicos?\s*:\s*(.+?)(?:\r?\n|$)/i);
      if (tecnicosMatch) {
        body.assignedTechnicians = tecnicosMatch[1].trim();
        console.log('[Webhook GLPI] Técnicos extraídos:', body.assignedTechnicians);
      }

      // Extraer grupo asignado
      const grupoMatch = rawBody.match(/Asignad[ao] al grupo\s*:\s*(.+?)(?:\r?\n|$)/i);
      if (grupoMatch) {
        body.assignedGroup = grupoMatch[1].trim();
        console.log('[Webhook GLPI] Grupo extraído:', body.assignedGroup);
      }
    }

    console.log('[Webhook GLPI] Ticket ID final:', ticketId);

    if (!ticketId) {
      console.error('[Webhook GLPI] No se encontró ID de ticket en el payload');
      console.log('[Webhook GLPI] Contenido completo:', rawBody);
      // Por ahora, retornar éxito con el contenido para debug
      return NextResponse.json({
        success: true,
        warning: 'ID de ticket no encontrado - modo debug',
        rawBodyFull: rawBody,
        message: 'Webhook recibido correctamente, revisa rawBodyFull para ver el formato'
      }, { status: 200 });
    }

    // Obtener datos completos del ticket desde GLPI API
    const glpiData = await fetchTicketFromGLPI(ticketId);

    // Crear objeto de actualización usando datos de GLPI si están disponibles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    const now = new Date();

    // Usar datos de GLPI si están disponibles, sino usar los del webhook
    let statusCode: number | undefined;
    let statusLabel: string | undefined;
    let priority: number | undefined;
    let priorityLabel: string | undefined;
    let assignedTo: string | undefined;
    let group: string | undefined;
    let category: string | undefined;
    let lastFollowupContent: string | undefined;
    let requesterEmail: string | undefined;
    let ticketTitle: string | undefined;

    if (glpiData) {
      const glpiTicket = glpiData.ticket;
      // Datos desde GLPI API
      statusCode = glpiTicket.status as number;
      statusLabel = STATUS_MAP[statusCode] || undefined;
      priority = glpiTicket.priority as number;
      priorityLabel = PRIORITY_MAP[priority] || undefined;

      // Título del ticket
      if (typeof glpiTicket.name === 'string') {
        ticketTitle = decodeHtmlEntities(glpiTicket.name);
      }

      // Categoría expandida - decodificar entidades HTML
      if (typeof glpiTicket.itilcategories_id === 'string') {
        category = decodeHtmlEntities(glpiTicket.itilcategories_id);
      }

      // Email del solicitante (obtenido de fetchTicketFromGLPI que consulta Ticket_User y User)
      if (glpiData.requesterEmail) {
        requesterEmail = glpiData.requesterEmail;
      }

      // Último seguimiento
      if (glpiData.lastFollowup) {
        lastFollowupContent = glpiData.lastFollowup;
      }

      console.log('[Webhook GLPI] Datos de GLPI API - status:', statusCode, statusLabel, 'priority:', priority, priorityLabel, 'requesterEmail:', requesterEmail, 'title:', ticketTitle);
    } else {
      // Fallback a datos del webhook
      statusCode = b.status ? Number(b.status) : undefined;
      statusLabel = statusCode ? STATUS_MAP[statusCode] : (b.statusText as string | undefined);
      priority = b.priority ? Number(b.priority) : undefined;
    }

    // Si tenemos un texto de estado del webhook, verificar si indica un estado diferente
    // Esto es útil cuando el webhook tiene un estado más actualizado que la API
    if (b.statusText) {
      const textStatusCode = getStatusCodeFromText(b.statusText as string);
      if (textStatusCode !== undefined) {
        // Si el estado del texto es diferente al de la API, usar el del texto
        // Especialmente importante para estados finales como "cerrado"
        if (textStatusCode !== statusCode) {
          console.log(`[Webhook GLPI] Estado del texto (${b.statusText} -> ${textStatusCode}) difiere de API (${statusCode}), usando el del texto`);
          statusCode = textStatusCode;
          statusLabel = STATUS_MAP[textStatusCode];
        }
      }
    }

    // Técnicos asignados - preferir los extraídos del texto plano (son más precisos)
    if (b.assignedTechnicians) {
      assignedTo = b.assignedTechnicians;
    } else {
      assignedTo = b.users_id_assign_name || b.assigned_to || b._users_id_assign?.[0]?.name;
    }

    // Grupo asignado - preferir el extraído del texto plano
    if (b.assignedGroup) {
      group = b.assignedGroup;
    } else {
      group = b.groups_id_assign_name || b._groups_id_assign?.[0]?.name;
    }

    console.log('[Webhook GLPI] Datos finales - assignedTo:', assignedTo, 'group:', group, 'category:', category);

    const update: TicketUpdate = {
      ticketId: ticketId,
      status: statusCode,
      statusLabel: statusLabel,
      priority: priority,
      priorityLabel: priorityLabel,
      assignedTo: assignedTo,
      group: group,
      category: category,
      lastUpdate: lastFollowupContent || b.content || b.followup_content || 'Actualización de ticket',
      lastUpdateDate: now.toISOString(),
      updatedAt: now,
      eventType: b.event_type || 'update',
    };

    // Emitir evento a todos los clientes SSE conectados
    ticketEvents.emit(update);
    console.log(`[Webhook GLPI] Evento emitido para ticket ${ticketId}. Listeners activos: ${ticketEvents.getListenerCount()}`);

    // Enviar push notification al usuario solicitante
    let pushResult = { sent: 0, failed: 0 };
    if (requesterEmail) {
      console.log(`[Webhook GLPI] Enviando push notification a ${requesterEmail}`);
      pushResult = await sendPushNotificationToUser(
        requesterEmail,
        ticketId,
        statusCode,
        ticketTitle
      );
      console.log(`[Webhook GLPI] Push result: ${pushResult.sent} enviados, ${pushResult.failed} fallidos`);
    } else {
      console.log('[Webhook GLPI] No se encontró email del solicitante, omitiendo push notification');
    }

    return NextResponse.json({
      success: true,
      message: `Ticket ${ticketId} procesado y notificado`,
      ticketId: ticketId,
      listenersNotified: ticketEvents.getListenerCount(),
      pushNotifications: pushResult,
    });

  } catch (error) {
    console.error('[Webhook GLPI] Error procesando webhook:', error);
    console.error('[Webhook GLPI] Raw body en error:', rawBody?.substring(0, 500));
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown error',
        rawBodyPreview: rawBody?.substring(0, 200)
      },
      { status: 500 }
    );
  }
}

// Endpoint para verificar el estado del webhook
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Webhook GLPI activo',
    activeListeners: ticketEvents.getListenerCount(),
    pendingUpdates: ticketEvents.getPendingUpdates().length,
  });
}
