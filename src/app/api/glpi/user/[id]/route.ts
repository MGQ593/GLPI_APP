import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener información de un usuario por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('session_token');

    if (!userId) {
      return NextResponse.json(
        { error: 'El ID del usuario es requerido' },
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

    // Obtener información del usuario
    const userUrl = `${apiUrl}/User/${userId}`;
    console.log('Obteniendo usuario:', userUrl);

    const response = await fetch(userUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI User:', response.status);

    if (!response.ok) {
      console.error('Error de GLPI User:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al obtener usuario', details: responseText },
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
      user: {
        id: data.id,
        firstname: data.firstname || '',
        realname: data.realname || '',
        name: data.name || '',
      },
    });

  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
