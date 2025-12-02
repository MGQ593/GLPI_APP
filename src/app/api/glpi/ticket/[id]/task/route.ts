import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener tareas del ticket
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

    // Obtener tareas del ticket
    const taskUrl = `${apiUrl}/Ticket/${ticketId}/TicketTask`;
    console.log('Obteniendo tareas del ticket:', taskUrl);

    const response = await fetch(taskUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Tasks:', response.status);

    if (!response.ok) {
      // Si no hay tareas, GLPI puede devolver 404 o error
      if (response.status === 400 || response.status === 404) {
        return NextResponse.json({
          success: true,
          tasks: [],
        });
      }
      console.error('Error de GLPI Tasks:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener tareas', details: responseText },
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

    // Filtrar solo tareas públicas (is_private === 0)
    const allTasks = Array.isArray(data) ? data : [];
    const publicTasks = allTasks.filter(task => task.is_private === 0);

    return NextResponse.json({
      success: true,
      tasks: publicTasks,
    });

  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
