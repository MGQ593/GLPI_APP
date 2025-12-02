import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener grupos asociados al ticket
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

    // Obtener Group_Ticket del ticket
    const groupTicketUrl = `${apiUrl}/Ticket/${ticketId}/Group_Ticket`;
    console.log('Obteniendo grupos del ticket:', groupTicketUrl);

    const response = await fetch(groupTicketUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Group_Ticket:', response.status);

    if (!response.ok) {
      console.error('Error de GLPI Group_Ticket:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener grupos del ticket', details: responseText },
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

    // GLPI puede devolver un array de Group_Ticket
    // type: 1 = Solicitante, 2 = Técnico asignado, 3 = Observador
    const groupTickets = Array.isArray(data) ? data : [];

    return NextResponse.json({
      success: true,
      groupTickets: groupTickets,
    });

  } catch (error) {
    console.error('Error obteniendo grupos del ticket:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
