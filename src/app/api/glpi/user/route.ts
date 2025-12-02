import { NextRequest, NextResponse } from 'next/server';

// Interfaz para la respuesta de búsqueda de usuario
// Los campos devueltos por GLPI según los logs:
// "1": username, "2": id, "5": email, "6": phone, "8": realname,
// "9": firstname, "20": location, "79": usertitle, "81": otro campo
interface GlpiUserSearchResponse {
  totalcount: number;
  count: number;
  data: Array<Record<string, string | number | null>>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const sessionToken = searchParams.get('session_token');

    if (!email) {
      return NextResponse.json(
        { error: 'El email es requerido' },
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

    // Construir la URL de búsqueda de usuario
    const searchUrl = new URL(`${apiUrl}/search/User`);
    searchUrl.searchParams.append('criteria[0][field]', '5'); // Campo email
    searchUrl.searchParams.append('criteria[0][searchtype]', 'contains');
    searchUrl.searchParams.append('criteria[0][value]', email);
    searchUrl.searchParams.append('forcedisplay[0]', '2');  // id
    searchUrl.searchParams.append('forcedisplay[1]', '1');  // name
    searchUrl.searchParams.append('forcedisplay[2]', '8');  // realname
    searchUrl.searchParams.append('forcedisplay[3]', '6');  // phone
    searchUrl.searchParams.append('forcedisplay[4]', '9');  // firstname
    searchUrl.searchParams.append('forcedisplay[5]', '81'); // emails
    searchUrl.searchParams.append('forcedisplay[6]', '79'); // usertitles_id
    searchUrl.searchParams.append('forcedisplay[7]', '20'); // locations_id

    console.log('Buscando usuario en GLPI:', searchUrl.toString());

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI User Search:', response.status, responseText);

    if (!response.ok) {
      console.error('Error de GLPI User Search:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al buscar usuario en GLPI', details: responseText },
        { status: response.status }
      );
    }

    // Parsear la respuesta
    let data: GlpiUserSearchResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Error parseando respuesta GLPI:', responseText);
      return NextResponse.json(
        { error: 'Respuesta inválida de GLPI' },
        { status: 500 }
      );
    }

    // Verificar si se encontró el usuario
    if (!data.data || data.data.length === 0) {
      return NextResponse.json(
        { error: 'Usuario no encontrado en GLPI' },
        { status: 404 }
      );
    }

    // Tomar el primer resultado
    const userData = data.data[0];

    // Log para depuración - ver todos los campos devueltos
    console.log('[GLPI User] Datos del usuario:', JSON.stringify(userData, null, 2));

    // Según los logs reales de GLPI:
    // Campo 81 contiene el título/cargo (ej: "Analista de Operaciones")
    // Campo 79 viene null en este caso
    const userTitleText = userData['81'] as string || '';

    console.log('[GLPI User] Campo 81 (userTitle):', userTitleText);

    // Mapeo correcto basado en la respuesta REAL de GLPI:
    // "1": username, "2": id, "5": email, "6": phone, "8": realname (ID),
    // "9": firstname, "20": location, "79": null, "81": título/cargo
    return NextResponse.json({
      success: true,
      user: {
        id: userData['2'],
        username: userData['1'],
        firstname: userData['9'],
        realname: userData['8'],
        email: userData['5'],  // El email está en el campo 5, no 81
        phone: userData['6'],
        location_id: userData['20'],
        usertitle_id: userData['79'],
        userTitle: userTitleText, // Título/Cargo del usuario (ej: "Analista de Operaciones")
      },
    });

  } catch (error) {
    console.error('Error en búsqueda de usuario:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
