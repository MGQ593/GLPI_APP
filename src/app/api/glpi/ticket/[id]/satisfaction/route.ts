import { NextRequest, NextResponse } from 'next/server';

const GLPI_URL = process.env.GLPI_REST_API_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;

// GET - Obtener encuesta del ticket
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionToken = request.headers.get('X-Session-Token');
    if (!sessionToken) {
      return NextResponse.json({ error: 'Session token requerido' }, { status: 401 });
    }

    console.log(`[Satisfaction API] Obteniendo encuesta para ticket ${params.id}`);

    // Estrategia: Obtener TicketSatisfaction directamente por ID del ticket
    // GLPI permite acceder directamente si el ID de satisfaction = ID de ticket
    // (en muchas instalaciones, tickets_id = id de TicketSatisfaction)

    // Intentar obtener directamente con el ID del ticket
    const directUrl = `${GLPI_URL}/TicketSatisfaction/${params.id}`;
    console.log(`[Satisfaction API] Intentando URL directa: ${directUrl}`);

    const directResponse = await fetch(directUrl, {
      headers: {
        'App-Token': APP_TOKEN!,
        'Session-Token': sessionToken,
      },
    });

    console.log(`[Satisfaction API] Respuesta directa: ${directResponse.status}`);

    if (directResponse.ok) {
      const detail = await directResponse.json();
      console.log(`[Satisfaction API] Ticket ${params.id} - Detalle encontrado:`, JSON.stringify(detail));

      // Verificar que el tickets_id coincide con el ticket que buscamos
      if (detail && detail.tickets_id === parseInt(params.id)) {
        return NextResponse.json(detail);
      }
    }

    // Si la respuesta directa no funciona, intentar obtener todas las encuestas y filtrar
    // (esto es menos eficiente pero funciona como fallback)
    const allUrl = `${GLPI_URL}/TicketSatisfaction?range=0-1000`;
    console.log(`[Satisfaction API] Obteniendo todas las encuestas: ${allUrl}`);

    const allResponse = await fetch(allUrl, {
      headers: {
        'App-Token': APP_TOKEN!,
        'Session-Token': sessionToken,
      },
    });

    console.log(`[Satisfaction API] Respuesta getAllSatisfactions: ${allResponse.status}`);

    if (allResponse.ok) {
      const allData = await allResponse.json();
      console.log(`[Satisfaction API] Total encuestas: ${Array.isArray(allData) ? allData.length : 'no es array'}`);

      if (Array.isArray(allData)) {
        const found = allData.find((s: { tickets_id: number }) => s.tickets_id === parseInt(params.id));
        if (found) {
          console.log(`[Satisfaction API] Ticket ${params.id} - Encuesta encontrada:`, JSON.stringify(found));
          return NextResponse.json(found);
        }
      }
    } else {
      const errorText = await allResponse.text();
      console.log(`[Satisfaction API] Error obteniendo todas: ${errorText}`);
    }

    console.log(`[Satisfaction API] Ticket ${params.id} - Sin encuesta`);
    return NextResponse.json(null);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT - Responder encuesta existente
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userSessionToken = request.headers.get('X-Session-Token');
    if (!userSessionToken) {
      return NextResponse.json({ error: 'Session token requerido' }, { status: 401 });
    }

    const { satisfactionId, satisfaction, comment } = await request.json();
    const ticketId = params.id;

    console.log(`[Satisfaction PUT] Ticket: ${ticketId}, SatisfactionId: ${satisfactionId}, Rating: ${satisfaction}`);

    if (!satisfactionId || satisfactionId === 0) {
      return NextResponse.json({ error: 'No existe encuesta de satisfacción para este ticket' }, { status: 400 });
    }

    // ============================================================
    // INTENTO 1: PUT a TicketSatisfaction usando tickets_id
    // Según documentación GLPI, el endpoint usa tickets_id como identificador
    // ============================================================
    console.log(`[Satisfaction PUT] Intento 1: PUT /TicketSatisfaction/${ticketId} con sesión usuario`);

    let response = await fetch(`${GLPI_URL}/TicketSatisfaction/${ticketId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': APP_TOKEN!,
        'Session-Token': userSessionToken,
      },
      body: JSON.stringify({
        input: {
          satisfaction,
          comment: comment || '',
        },
      }),
    });

    let responseText = await response.text();
    console.log(`[Satisfaction PUT] Intento 1 respuesta: ${response.status} ${responseText}`);

    if (response.ok) {
      console.log(`[Satisfaction PUT] ¡Éxito con TicketSatisfaction!`);
      return NextResponse.json({ success: true, method: 'TicketSatisfaction-user' });
    }

    // ============================================================
    // INTENTO 2: PUT con sesión de admin
    // ============================================================
    console.log(`[Satisfaction PUT] Intento 2: PUT /TicketSatisfaction/${ticketId} con sesión admin`);

    const initResponse = await fetch(`${GLPI_URL}/initSession`, {
      headers: {
        'App-Token': APP_TOKEN!,
        'Authorization': `user_token ${USER_TOKEN}`,
      },
    });

    if (initResponse.ok) {
      const { session_token: adminSessionToken } = await initResponse.json();

      response = await fetch(`${GLPI_URL}/TicketSatisfaction/${ticketId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': APP_TOKEN!,
          'Session-Token': adminSessionToken,
        },
        body: JSON.stringify({
          input: {
            satisfaction,
            comment: comment || '',
          },
        }),
      });

      responseText = await response.text();
      console.log(`[Satisfaction PUT] Intento 2 respuesta: ${response.status} ${responseText}`);

      // Cerrar sesión admin
      await fetch(`${GLPI_URL}/killSession`, {
        headers: { 'App-Token': APP_TOKEN!, 'Session-Token': adminSessionToken },
      });

      if (response.ok) {
        console.log(`[Satisfaction PUT] ¡Éxito con TicketSatisfaction + admin!`);
        return NextResponse.json({ success: true, method: 'TicketSatisfaction-admin' });
      }
    }

    // ============================================================
    // INTENTO 3: Fallback al plugin PluginSatisfactionSurveyAnswer con sesión ADMIN
    // ============================================================
    console.log(`[Satisfaction PUT] Intento 3: POST /PluginSatisfactionSurveyAnswer con sesión admin`);

    // Obtener nueva sesión admin para el plugin
    const initPluginResponse = await fetch(`${GLPI_URL}/initSession`, {
      headers: {
        'App-Token': APP_TOKEN!,
        'Authorization': `user_token ${USER_TOKEN}`,
      },
    });

    let pluginText = '';
    let pluginResponse: Response | null = null;

    if (initPluginResponse.ok) {
      const { session_token: adminPluginToken } = await initPluginResponse.json();

      pluginResponse = await fetch(`${GLPI_URL}/PluginSatisfactionSurveyAnswer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': APP_TOKEN!,
          'Session-Token': adminPluginToken,
        },
        body: JSON.stringify({
          input: {
            ticketsatisfactions_id: satisfactionId,
            plugin_satisfaction_surveyquestions_id: 1, // ID de la pregunta principal
            answer: String(satisfaction),
            comment: comment || null,
          },
        }),
      });

      pluginText = await pluginResponse.text();
      console.log(`[Satisfaction PUT] Intento 3 respuesta: ${pluginResponse.status} ${pluginText}`);

      // Cerrar sesión admin
      await fetch(`${GLPI_URL}/killSession`, {
        headers: { 'App-Token': APP_TOKEN!, 'Session-Token': adminPluginToken },
      });
    } else {
      console.log(`[Satisfaction PUT] Intento 3: No se pudo obtener sesión admin`);
    }

    if (pluginResponse && (pluginResponse.ok || pluginResponse.status === 201)) {
      console.log(`[Satisfaction PUT] ¡Éxito con plugin! (Nota: TicketSatisfaction.date_answered puede no actualizarse)`);
      return NextResponse.json({
        success: true,
        method: 'PluginSatisfactionSurveyAnswer',
        warning: 'Respuesta guardada en plugin. El campo date_answered de TicketSatisfaction puede no actualizarse automáticamente.'
      });
    }

    // ============================================================
    // Todos los intentos fallaron
    // ============================================================
    console.error(`[Satisfaction PUT] Todos los intentos fallaron`);
    return NextResponse.json({
      error: 'No se pudo guardar la calificación. Verifica permisos en GLPI.',
      details: responseText
    }, { status: 400 });

  } catch (error) {
    console.error('[Satisfaction PUT] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
