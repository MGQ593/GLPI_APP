import { NextRequest, NextResponse } from 'next/server';

// Mapeo de estados de GLPI
const STATUS_MAP: Record<number, string> = {
  1: 'nuevo',
  2: 'en-progreso',
  3: 'en-progreso',
  4: 'pendiente',
  5: 'resuelto',
  6: 'cerrado',
};

// Mapeo de prioridades de GLPI
const PRIORITY_MAP: Record<number, string> = {
  1: 'muy-baja',
  2: 'baja',
  3: 'media',
  4: 'alta',
  5: 'muy-alta',
  6: 'mayor',
};

// Extraer nombre del técnico del displayname HTML
function extractName(displayname: string | null | undefined): string {
  if (!displayname) return 'Sin asignar';
  return displayname.split('<')[0].trim() || 'Sin asignar';
}

// Mapear código de prioridad a string
function getPriorityFromCode(code: number): string {
  const priorityMap: Record<number, string> = {
    1: 'muy-baja',
    2: 'baja',
    3: 'media',
    4: 'alta',
    5: 'muy-alta',
    6: 'mayor',
  };
  return priorityMap[code] || 'media';
}

// Decodificar HTML entities del seguimiento
function decodeFollowup(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/&#60;/g, '<')
    .replace(/&#62;/g, '>')
    .replace(/&#38;/g, '&')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim() || null;
}

// Extraer última parte de la categoría
function extractCategory(fullCategory: string | null | undefined): string {
  if (!fullCategory) return 'Sin categoría';
  const parts = fullCategory.split(' > ');
  return parts[parts.length - 1];
}

// Formatear fecha de GLPI a formato legible
function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Formatear ID del ticket (solo número con prefijo)
function formatTicketId(id: number): string {
  return `#${id}`;
}

// Interfaz para la fila de ticket de GLPI
interface GlpiTicketRow {
  id: number;
  Ticket_2?: { 0?: { name: number } };
  Ticket_1?: { 0?: { name: string } };
  Ticket_12?: { 0?: { name: number } };
  Ticket_3?: { 0?: { name: number }; displayname?: string };
  Ticket_15?: { 0?: { name: string } };
  Ticket_7?: { 0?: { name: string } };
  Ticket_5?: { displayname?: string };
  Ticket_8?: { 0?: { name: string | null } };
  Ticket_25?: { 0?: { name: string | null } };
  Ticket_36?: { 0?: { name: string | null } };
}

// Interfaz para la respuesta de GLPI
interface GlpiSearchResponse {
  totalcount: number;
  count?: number;
  rawdata?: {
    data?: {
      rows?: GlpiTicketRow[];
    };
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const sessionToken = searchParams.get('session_token');

    if (!userId) {
      return NextResponse.json(
        { error: 'El user_id es requerido' },
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

    // Construir la URL de búsqueda de tickets
    const searchUrl = new URL(`${apiUrl}/search/Ticket`);

    // Campos a mostrar
    searchUrl.searchParams.append('forcedisplay[0]', '2');   // ID
    searchUrl.searchParams.append('forcedisplay[1]', '1');   // Nombre/Asunto
    searchUrl.searchParams.append('forcedisplay[2]', '12');  // Estado
    searchUrl.searchParams.append('forcedisplay[3]', '3');   // Prioridad
    searchUrl.searchParams.append('forcedisplay[4]', '15');  // Fecha apertura
    searchUrl.searchParams.append('forcedisplay[5]', '7');   // Categoría
    searchUrl.searchParams.append('forcedisplay[6]', '5');   // Técnico asignado
    searchUrl.searchParams.append('forcedisplay[7]', '8');   // Grupo asignado
    searchUrl.searchParams.append('forcedisplay[8]', '25');  // Seguimiento
    searchUrl.searchParams.append('forcedisplay[9]', '36');  // Fecha seguimiento

    // Criterio: tickets del usuario
    searchUrl.searchParams.append('criteria[0][field]', '4');
    searchUrl.searchParams.append('criteria[0][searchtype]', 'equals');
    searchUrl.searchParams.append('criteria[0][value]', userId);

    // Ordenar por fecha de apertura descendente (más recientes primero)
    searchUrl.searchParams.append('sort', '15');  // Campo 15 = fecha de apertura
    searchUrl.searchParams.append('order', 'DESC');

    // Rango y datos raw
    searchUrl.searchParams.append('range', '0-50');
    searchUrl.searchParams.append('rawdata', '1');

    console.log('Buscando tickets en GLPI:', searchUrl.toString());

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Tickets:', response.status);

    if (!response.ok) {
      console.error('Error de GLPI Tickets Search:', response.status, responseText);
      return NextResponse.json(
        { error: 'Error al buscar tickets en GLPI', details: responseText },
        { status: response.status }
      );
    }

    // Parsear la respuesta
    let data: GlpiSearchResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Error parseando respuesta GLPI:', responseText);
      return NextResponse.json(
        { error: 'Respuesta inválida de GLPI' },
        { status: 500 }
      );
    }

    // Transformar los tickets
    const rows = data.rawdata?.data?.rows || [];

    const tickets = rows.map((row) => {
      const ticketId = row.Ticket_2?.[0]?.name || row.id;
      const statusCode = Number(row.Ticket_12?.[0]?.name) || 1;
      const priorityCode = Number(row.Ticket_3?.[0]?.name) || 3; // Default: media (3)

      console.log('Ticket priority code:', priorityCode, '-> mapped to:', getPriorityFromCode(priorityCode));

      return {
        id: formatTicketId(ticketId),
        rawId: ticketId,
        subject: row.Ticket_1?.[0]?.name || 'Sin asunto',
        status: STATUS_MAP[statusCode] || 'pendiente',
        statusCode: statusCode,
        priority: getPriorityFromCode(priorityCode),
        priorityCode: priorityCode,
        date: formatDate(row.Ticket_15?.[0]?.name),
        category: extractCategory(row.Ticket_7?.[0]?.name),
        assignedTo: extractName(row.Ticket_5?.displayname),
        group: row.Ticket_8?.[0]?.name || null,
        lastUpdate: decodeFollowup(row.Ticket_25?.[0]?.name),
        lastUpdateDate: formatDate(row.Ticket_36?.[0]?.name),
      };
    });

    return NextResponse.json({
      success: true,
      totalCount: data.totalcount || 0,
      tickets: tickets,
    });

  } catch (error) {
    console.error('Error en búsqueda de tickets:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
