import { NextRequest, NextResponse } from 'next/server';

// GET - Obtener soluciones del ticket
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

    const headers = {
      'Content-Type': 'application/json',
      'App-Token': appToken,
      'Session-Token': sessionToken,
    };

    // Usamos un Map para guardar soluciones por ID (evitar duplicados)
    const solutionsMap = new Map<number, { id?: number; status?: number; users_id?: number; date_creation?: string; content?: string }>();

    // 1. Primero intentamos con el endpoint directo del ticket
    const solutionUrl = `${apiUrl}/Ticket/${ticketId}/ITILSolution`;
    console.log('Obteniendo soluciones del ticket:', solutionUrl);

    const response = await fetch(solutionUrl, {
      method: 'GET',
      headers,
    });

    const responseText = await response.text();
    console.log('Respuesta GLPI Solutions:', response.status);
    console.log(`[Solution GET] Raw response for ticket ${ticketId}:`, responseText.substring(0, 500));

    if (response.ok) {
      try {
        const data = JSON.parse(responseText);
        const directSolutions = Array.isArray(data) ? data : [];
        console.log(`[Solution GET] Endpoint directo retornó ${directSolutions.length} solución(es)`);
        for (const sol of directSolutions) {
          if (sol.id) {
            solutionsMap.set(sol.id, sol);
          }
        }
      } catch {
        console.error('Error parseando respuesta GLPI:', responseText);
      }
    }

    // 2. SIEMPRE buscar también en el listado global de ITILSolution
    // Esto es necesario porque GLPI a veces no retorna todas las soluciones en el endpoint directo
    console.log(`[Solution GET] Ticket ${ticketId} - Buscando también en listado global ITILSolution...`);

    try {
      // Obtener las últimas 100 ITILSolutions ordenadas por fecha descendente
      const listUrl = `${apiUrl}/ITILSolution?range=0-100&order=DESC&sort=date_creation`;
      console.log('[Solution GET] URL listado ITILSolution:', listUrl);

      const listResponse = await fetch(listUrl, { method: 'GET', headers });
      const listText = await listResponse.text();
      console.log('[Solution GET] Respuesta listado:', listResponse.status, 'Total caracteres:', listText.length);

      if (listResponse.ok) {
        const listData = JSON.parse(listText);
        const solutionsList = Array.isArray(listData) ? listData : [];
        console.log(`[Solution GET] Total ITILSolutions obtenidas del listado: ${solutionsList.length}`);

        // Log de las primeras 10 para debug
        solutionsList.slice(0, 10).forEach((sol: { id?: number; items_id?: number; itemtype?: string; status?: number; date_creation?: string }, idx: number) => {
          console.log(`[Solution GET] Sol ${idx + 1}: id=${sol.id}, items_id=${sol.items_id}, itemtype=${sol.itemtype}, status=${sol.status}, date=${sol.date_creation}`);
        });

        // Filtrar solo las que corresponden a este ticket
        const ticketSolutions = solutionsList.filter(
          (sol: { items_id?: number; itemtype?: string }) =>
            String(sol.items_id) === String(ticketId) && sol.itemtype === 'Ticket'
        );

        console.log(`[Solution GET] Encontradas ${ticketSolutions.length} soluciones para ticket ${ticketId} en listado global`);

        for (const sol of ticketSolutions) {
          console.log(`[Solution GET] Solución del listado global:`, {
            id: sol.id,
            status: sol.status,
            items_id: sol.items_id,
            itemtype: sol.itemtype,
            date_creation: sol.date_creation,
          });
          // Agregar al Map (sobrescribe si ya existe, pero con los mismos datos)
          if (sol.id) {
            solutionsMap.set(sol.id, sol);
          }
        }
      }
    } catch (listErr) {
      console.error('Error en listado de soluciones:', listErr);
    }

    // Convertir el Map a array
    const solutions = Array.from(solutionsMap.values());

    // Log detallado de cada solución para debugging
    console.log(`[Solution GET] Ticket ${ticketId} - ${solutions.length} solución(es) encontrada(s) (final)`);
    solutions.forEach((sol, idx) => {
      console.log(`[Solution GET] Solución ${idx + 1}:`, {
        id: sol.id,
        status: sol.status,
        statusType: typeof sol.status,
        users_id: sol.users_id,
        date_creation: sol.date_creation,
        content: sol.content?.substring(0, 50)
      });
    });

    // IMPORTANTE: Si hay múltiples soluciones, la última (más reciente) es la que determina el estado actual
    // En GLPI, cuando se rechaza una solución y se agrega otra, pueden existir ambas
    console.log(`[Solution GET] Resumen de status de soluciones:`, solutions.map(s => ({ id: s.id, status: s.status })));

    return NextResponse.json({
      success: true,
      solutions: solutions,
    });

  } catch (error) {
    console.error('Error obteniendo soluciones:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
