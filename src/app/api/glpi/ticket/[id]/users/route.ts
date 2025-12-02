import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener usuarios asociados al ticket (solicitantes, técnicos, observadores)
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

    // Obtener Ticket_User del ticket
    const ticketUserUrl = `${apiUrl}/Ticket/${ticketId}/Ticket_User`;
    console.log('Obteniendo usuarios del ticket:', ticketUserUrl);

    const response = await fetch(ticketUserUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Ticket_User:', response.status);

    if (!response.ok) {
      console.error('Error de GLPI Ticket_User:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener usuarios del ticket', details: responseText },
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

    // GLPI puede devolver un array de Ticket_User
    // type: 1 = Solicitante, 2 = Técnico asignado, 3 = Observador
    const ticketUsers = Array.isArray(data) ? data : [];

    return NextResponse.json({
      success: true,
      ticketUsers: ticketUsers,
    });

  } catch (error) {
    console.error('Error obteniendo usuarios del ticket:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
