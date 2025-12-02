// src/app/api/glpi/solution/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

const GLPI_URL = process.env.GLPI_REST_API_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionToken = request.headers.get('X-Session-Token');
    if (!sessionToken) {
      return NextResponse.json({ error: 'Session token requerido' }, { status: 401 });
    }

    if (!GLPI_URL || !APP_TOKEN) {
      console.error('Variables de entorno no configuradas');
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 });
    }

    const { status, users_id, ticket_id } = await request.json();

    // status: 3 = aprobar, 4 = rechazar
    if (status !== 3 && status !== 4) {
      return NextResponse.json({ error: 'Status inválido. Use 3 para aprobar o 4 para rechazar.' }, { status: 400 });
    }

    const solutionId = params.id;
    console.log(`Actualizando solución ${solutionId} con status: ${status}, users_id: ${users_id}, ticket_id: ${ticket_id}`);

    // GLPI requiere users_id_approval para registrar quién aprueba/rechaza
    // status: 2=pendiente, 3=aprobada, 4=rechazada
    const inputData: { status: number; users_id_approval?: number } = { status };
    if (users_id) {
      inputData.users_id_approval = users_id;
    }

    const requestBody = JSON.stringify({ input: inputData });

    console.log(`[Solution API] Enviando PUT a: ${GLPI_URL}/ITILSolution/${solutionId}`);
    console.log(`[Solution API] Body: ${requestBody}`);

    const response = await fetch(`${GLPI_URL}/ITILSolution/${solutionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': APP_TOKEN,
        'Session-Token': sessionToken,
      },
      body: requestBody,
    });

    const responseText = await response.text();
    console.log(`[Solution API] Respuesta GLPI: ${response.status} ${responseText}`);

    if (!response.ok) {
      console.error('Error actualizando solución:', responseText);
      return NextResponse.json({ error: 'Error al actualizar solución', details: responseText }, { status: response.status });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { updated: true };
    }

    // Si se aprobó la solución (status 3) y tenemos el ticket_id, cerrar el ticket
    let ticketClosed = false;
    let ticketReopened = false;

    if (status === 3 && ticket_id) {
      console.log(`[Solution API] Solución aprobada, cerrando ticket ${ticket_id}...`);

      try {
        const ticketResponse = await fetch(`${GLPI_URL}/Ticket/${ticket_id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'App-Token': APP_TOKEN,
            'Session-Token': sessionToken,
          },
          body: JSON.stringify({ input: { status: 6 } }), // 6 = Cerrado
        });

        const ticketResponseText = await ticketResponse.text();
        console.log(`[Solution API] Respuesta cierre ticket: ${ticketResponse.status} ${ticketResponseText}`);

        if (ticketResponse.ok) {
          ticketClosed = true;
          console.log(`[Solution API] Ticket ${ticket_id} cerrado exitosamente`);
        } else {
          console.error(`[Solution API] Error cerrando ticket ${ticket_id}:`, ticketResponseText);
        }
      } catch (ticketError) {
        console.error(`[Solution API] Error al intentar cerrar ticket ${ticket_id}:`, ticketError);
      }
    }

    // Si se rechazó la solución (status 4) y tenemos el ticket_id, reabrir el ticket
    if (status === 4 && ticket_id) {
      console.log(`[Solution API] Solución rechazada, reabriendo ticket ${ticket_id}...`);

      try {
        const ticketResponse = await fetch(`${GLPI_URL}/Ticket/${ticket_id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'App-Token': APP_TOKEN,
            'Session-Token': sessionToken,
          },
          body: JSON.stringify({ input: { status: 2 } }), // 2 = En Progreso (Asignado)
        });

        const ticketResponseText = await ticketResponse.text();
        console.log(`[Solution API] Respuesta reapertura ticket: ${ticketResponse.status} ${ticketResponseText}`);

        if (ticketResponse.ok) {
          ticketReopened = true;
          console.log(`[Solution API] Ticket ${ticket_id} reabierto exitosamente`);
        } else {
          console.error(`[Solution API] Error reabriendo ticket ${ticket_id}:`, ticketResponseText);
        }
      } catch (ticketError) {
        console.error(`[Solution API] Error al intentar reabrir ticket ${ticket_id}:`, ticketError);
      }
    }

    return NextResponse.json({ success: true, data, ticketClosed, ticketReopened });
  } catch (error) {
    console.error('Error en solución:', error);
    return NextResponse.json({ error: 'Error interno', details: String(error) }, { status: 500 });
  }
}
