import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener followups del ticket
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketId = params.id;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('session_token');

    if (!ticketId) {
      return NextResponse.json(
        { error: 'El ID del ticket es requerido' },
        { status: 400 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'El session_token es requerido' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.GLPI_REST_API_URL;
    const appToken = process.env.GLPI_APP_TOKEN;

    if (!apiUrl || !appToken) {
      console.error('Variables de entorno de GLPI REST API no configuradas');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Obtener followups del ticket - agregar múltiples parámetros anti-cache
    // NOTA: No usar expand_dropdowns=true porque necesitamos users_id como número para obtener el nombre del usuario
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const followupUrl = `${apiUrl}/Ticket/${ticketId}/ITILFollowup?_nocache=${timestamp}&_rand=${randomId}&get_hateoas=false`;
    console.log('Obteniendo followups del ticket:', followupUrl);

    const response = await fetch(followupUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      cache: 'no-store',
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Followups:', response.status);

    if (!response.ok) {
      console.error('Error de GLPI Followups:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener followups', details: responseText },
        { status: response.status }
      );
    }

    // Parsear la respuesta
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Error parseando respuesta GLPI:', responseText);
      return NextResponse.json(
        { error: 'Respuesta inválida de GLPI' },
        { status: 500 }
      );
    }

    // GLPI puede devolver un array de followups o un array vacío
    const followups = Array.isArray(data) ? data : [];

    // Log para debug del polling
    console.log(`[Followup GET] Ticket ${ticketId}: ${followups.length} followups, IDs: [${followups.map((f: { id: number }) => f.id).join(', ')}]`);

    // Respuesta con headers anti-cache
    const jsonResponse = NextResponse.json({
      success: true,
      followups: followups,
    });

    // Agregar headers anti-cache a la respuesta
    jsonResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    jsonResponse.headers.set('Pragma', 'no-cache');
    jsonResponse.headers.set('Expires', '0');

    return jsonResponse;

  } catch (error) {
    console.error('Error obteniendo followups:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// POST - Enviar nuevo followup
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketId = params.id;
    const body = await request.json();
    const { content, session_token, users_id } = body;

    if (!ticketId) {
      return NextResponse.json(
        { error: 'El ID del ticket es requerido' },
        { status: 400 }
      );
    }

    if (!session_token) {
      return NextResponse.json(
        { error: 'El session_token es requerido' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'El contenido del comentario es requerido' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.GLPI_REST_API_URL;
    const appToken = process.env.GLPI_APP_TOKEN;

    if (!apiUrl || !appToken) {
      console.error('Variables de entorno de GLPI REST API no configuradas');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Primero, verificar el estado del ticket y reabrirlo si está cerrado/resuelto
    const ticketUrl = `${apiUrl}/Ticket/${ticketId}`;

    try {
      const ticketResponse = await fetch(ticketUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': appToken,
          'Session-Token': session_token,
        },
      });

      if (ticketResponse.ok) {
        const ticketData = await ticketResponse.json();
        const currentStatus = ticketData.status;

        // Status 6 = Cerrado - Reabrir a En Progreso para que el usuario pueda seguir comentando
        // NOTA: Status 5 (Resuelto) ya NO se cambia aquí porque el frontend bloquea comentarios
        //       cuando hay una solución pendiente. El usuario debe aprobar/rechazar primero.
        if (currentStatus === 6) {
          console.log(`Ticket ${ticketId} está cerrado (status: ${currentStatus}), cambiando a En Progreso...`);

          // Cambiar el ticket a estado 2 (Asignado/En proceso) para reabrir
          const reopenResponse = await fetch(ticketUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'App-Token': appToken,
              'Session-Token': session_token,
            },
            body: JSON.stringify({
              input: {
                status: 2, // 2 = Asignado/En proceso
              },
            }),
          });

          if (!reopenResponse.ok) {
            const reopenError = await reopenResponse.text();
            console.error('Error reabriendo ticket:', reopenError);
            // Continuamos intentando enviar el followup de todos modos
          } else {
            console.log(`Ticket ${ticketId} reabierto exitosamente`);
          }
        }
      }
    } catch (ticketError) {
      console.error('Error verificando estado del ticket:', ticketError);
      // Continuamos intentando enviar el followup de todos modos
    }

    // Enviar el followup/comentario al ticket usando el endpoint global ITILFollowup
    // Esto es más compatible con diferentes perfiles de usuario
    const followupUrl = `${apiUrl}/ITILFollowup`;
    console.log('Enviando comentario al ticket:', followupUrl);

    const response = await fetch(followupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': session_token,
      },
      body: JSON.stringify({
        input: {
          itemtype: 'Ticket',
          items_id: parseInt(ticketId),
          content: content.trim(),
          is_private: 0,
          ...(users_id && { users_id: parseInt(users_id) }),
        },
      }),
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Followup:', response.status, responseText);

    if (!response.ok) {
      console.error('Error de GLPI Followup:', response.status, responseText);

      // Si falla, intentar con el endpoint alternativo del ticket
      console.log('Intentando endpoint alternativo...');
      const altFollowupUrl = `${apiUrl}/Ticket/${ticketId}/ITILFollowup`;
      const altResponse = await fetch(altFollowupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': appToken,
          'Session-Token': session_token,
        },
        body: JSON.stringify({
          input: {
            content: content.trim(),
            is_private: 0,
            ...(users_id && { users_id: parseInt(users_id) }),
          },
        }),
      });

      const altResponseText = await altResponse.text();
      console.log('Respuesta GLPI Followup (alt):', altResponse.status, altResponseText);

      if (!altResponse.ok) {
        console.error('Error de GLPI Followup (ambos endpoints):', altResponse.status, altResponseText);

        // Extraer mensaje de error más amigable
        let errorMessage = 'Error al enviar comentario';
        try {
          const errorData = JSON.parse(altResponseText);
          if (Array.isArray(errorData) && errorData[1]) {
            errorMessage = errorData[1];
          }
        } catch {
          // Usar mensaje genérico
        }

        return NextResponse.json(
          { error: errorMessage, details: altResponseText },
          { status: altResponse.status }
        );
      }

      // El endpoint alternativo funcionó
      let altData;
      try {
        altData = JSON.parse(altResponseText);
      } catch {
        return NextResponse.json(
          { error: 'Respuesta inválida de GLPI' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Comentario enviado exitosamente',
        data: altData,
      });
    }

    // Parsear la respuesta
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Error parseando respuesta GLPI:', responseText);
      return NextResponse.json(
        { error: 'Respuesta inválida de GLPI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Comentario enviado exitosamente',
      data: data,
    });

  } catch (error) {
    console.error('Error enviando comentario:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
