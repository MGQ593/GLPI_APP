import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener usuarios de un grupo
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const groupId = params.id;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('session_token');

    if (!groupId) {
      return NextResponse.json(
        { error: 'El ID del grupo es requerido' },
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

    // Obtener Group_User del grupo
    const groupUserUrl = `${apiUrl}/Group/${groupId}/Group_User`;
    console.log('Obteniendo usuarios del grupo:', groupUserUrl);

    const response = await fetch(groupUserUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Group_User:', response.status);

    if (!response.ok) {
      console.error('Error de GLPI Group_User:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener usuarios del grupo', details: responseText },
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

    // GLPI puede devolver un array de Group_User
    const groupUsers = Array.isArray(data) ? data : [];

    return NextResponse.json({
      success: true,
      groupUsers: groupUsers,
    });

  } catch (error) {
    console.error('Error obteniendo usuarios del grupo:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
