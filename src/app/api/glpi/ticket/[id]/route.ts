import { NextRequest, NextResponse } from 'next/server';

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

    // Obtener el detalle del ticket
    const ticketUrl = `${apiUrl}/Ticket/${ticketId}`;
    console.log('Obteniendo detalle del ticket:', ticketUrl);

    const response = await fetch(ticketUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Ticket Detail:', response.status);

    // Log completo del ticket para debugging
    try {
      const ticketData = JSON.parse(responseText);
      console.log(`[Ticket Detail] Ticket ${ticketId}:`, {
        status: ticketData.status,
        is_solved: ticketData.is_solved,
        solvedate: ticketData.solvedate,
        closedate: ticketData.closedate,
      });
    } catch { /* ignore parse error for logging */ }

    if (!response.ok) {
      console.error('Error de GLPI Ticket Detail:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener detalle del ticket', details: responseText },
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

    return NextResponse.json({
      success: true,
      ticket: data,
    });

  } catch (error) {
    console.error('Error obteniendo detalle del ticket:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
