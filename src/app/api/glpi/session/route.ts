import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const apiUrl = process.env.GLPI_REST_API_URL;
    const appToken = process.env.GLPI_APP_TOKEN;
    const userToken = process.env.GLPI_USER_TOKEN;

    if (!apiUrl || !appToken || !userToken) {
      console.error('Variables de entorno de GLPI REST API no configuradas');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Llamar a initSession de GLPI
    console.log('Llamando a GLPI initSession:', `${apiUrl}/initSession`);

    const response = await fetch(`${apiUrl}/initSession`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Authorization': `user_token ${userToken}`,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI:', response.status, responseText);

    if (!response.ok) {
      console.error('Error de GLPI initSession:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al iniciar sesión con GLPI', details: responseText },
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

    if (!data.session_token) {
      console.error('No se recibió session_token de GLPI');
      return NextResponse.json(
        { error: 'Error al obtener token de sesión' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session_token: data.session_token,
    });

  } catch (error) {
    console.error('Error en initSession:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// Endpoint para cerrar sesión de GLPI
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('session_token');

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'session_token es requerido' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.GLPI_REST_API_URL;
    const appToken = process.env.GLPI_APP_TOKEN;

    if (!apiUrl || !appToken) {
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Llamar a killSession de GLPI
    const response = await fetch(`${apiUrl}/killSession`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de GLPI killSession:', response.status, errorText);
      // No retornamos error porque la sesión podría ya estar cerrada
    }

    return NextResponse.json({
      success: true,
      message: 'Sesión cerrada correctamente',
    });

  } catch (error) {
    console.error('Error en killSession:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
