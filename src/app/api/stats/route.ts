// src/app/api/stats/route.ts
import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

// Caché en memoria para evitar llamadas excesivas a GLPI
let cachedStats: {
  satisfaction: number | null;
  satisfactionCount: number;
  queueCount: number | null;
} | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function fetchQueueCount(): Promise<number | null> {
  const apiUrl = process.env.GLPI_REST_API_URL;
  const appToken = process.env.GLPI_APP_TOKEN;
  const userToken = process.env.GLPI_USER_TOKEN;

  if (!apiUrl || !appToken || !userToken) return null;

  let sessionToken: string | null = null;

  try {
    // Iniciar sesión GLPI
    const sessionResponse = await fetch(`${apiUrl}/initSession`, {
      method: 'GET',
      headers: {
        'App-Token': appToken,
        'Authorization': `user_token ${userToken}`,
      },
    });

    if (!sessionResponse.ok) {
      console.error('[Stats] Error iniciando sesión GLPI:', sessionResponse.status);
      return null;
    }

    const sessionData = await sessionResponse.json();
    sessionToken = sessionData.session_token;

    // Buscar tickets con status 1 (nuevo), 2 (asignado), 3 (planificado)
    const params = new URLSearchParams({
      'criteria[0][field]': '12',
      'criteria[0][searchtype]': 'equals',
      'criteria[0][value]': '1',
      'criteria[1][link]': 'OR',
      'criteria[1][field]': '12',
      'criteria[1][searchtype]': 'equals',
      'criteria[1][value]': '2',
      'criteria[2][link]': 'OR',
      'criteria[2][field]': '12',
      'criteria[2][searchtype]': 'equals',
      'criteria[2][value]': '3',
      'forcedisplay[0]': '2',
      'range': '0-0',
    });

    const ticketsResponse = await fetch(
      `${apiUrl}/search/Ticket?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'App-Token': appToken,
          'Session-Token': sessionToken,
        },
      }
    );

    if (ticketsResponse.ok) {
      const ticketsData = await ticketsResponse.json();
      const count = ticketsData.totalcount ?? 0;
      console.log('[Stats] Tickets en cola:', count);
      return count;
    }

    const errorBody = await ticketsResponse.text();
    console.error('[Stats] Error buscando tickets GLPI:', ticketsResponse.status, errorBody);
    return null;
  } catch (error) {
    console.error('[Stats] Error consultando GLPI:', error);
    return null;
  } finally {
    // Cerrar sesión GLPI
    if (sessionToken) {
      try {
        await fetch(`${apiUrl}/killSession`, {
          method: 'GET',
          headers: {
            'App-Token': appToken!,
            'Session-Token': sessionToken,
          },
        });
      } catch {
        // Ignorar errores al cerrar sesión
      }
    }
  }
}

export async function GET() {
  const now = Date.now();

  // Retornar caché si es válido
  if (cachedStats && (now - cacheTimestamp) < CACHE_TTL) {
    return NextResponse.json(cachedStats);
  }

  const results = {
    satisfaction: null as number | null,
    satisfactionCount: 0,
    queueCount: null as number | null,
  };

  // 1. Obtener promedio de satisfacción desde PostgreSQL
  try {
    const satResult = await queryOne<{ avg_rating: string | null; total: string }>(
      `SELECT
        ROUND(AVG(satisfaction)::numeric, 1) as avg_rating,
        COUNT(*)::text as total
      FROM ticket_satisfaction
      WHERE status = 'completed' AND satisfaction IS NOT NULL`
    );

    if (satResult) {
      results.satisfaction = satResult.avg_rating ? parseFloat(satResult.avg_rating) : null;
      results.satisfactionCount = parseInt(satResult.total, 10) || 0;
    }
  } catch (error) {
    console.error('[Stats] Error consultando satisfacción:', error);
  }

  // 2. Obtener cantidad de tickets en cola desde GLPI
  results.queueCount = await fetchQueueCount();

  // Si GLPI falló pero tenemos caché anterior, usar el queueCount del caché
  if (results.queueCount === null && cachedStats?.queueCount != null) {
    results.queueCount = cachedStats.queueCount;
    console.log('[Stats] Usando queueCount del caché anterior:', results.queueCount);
  }

  // Guardar en caché
  cachedStats = results;
  cacheTimestamp = now;

  return NextResponse.json(results);
}
