// src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

// POST - Registrar nueva suscripción push
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, userEmail, deviceType, userAgent } = body;

    if (!subscription || !userEmail) {
      return NextResponse.json(
        { error: 'Se requiere subscription y userEmail' },
        { status: 400 }
      );
    }

    const { endpoint, keys } = subscription;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Subscription incompleta (falta endpoint o keys)' },
        { status: 400 }
      );
    }

    // Verificar si el endpoint ya está registrado para OTRO usuario
    const existingEndpoint = await query<{ user_email: string }>(
      'SELECT user_email FROM push_subscriptions WHERE endpoint = $1',
      [endpoint]
    );

    if (existingEndpoint.length > 0) {
      const existingEmail = existingEndpoint[0].user_email;

      if (existingEmail !== userEmail) {
        // El endpoint pertenece a otro usuario, no permitir
        console.log(`[Push Subscribe] Endpoint ya registrado para ${existingEmail}, usuario ${userEmail} no puede usarlo`);
        return NextResponse.json(
          {
            success: false,
            message: 'Este dispositivo ya está registrado para otro usuario',
            alreadyRegistered: true
          },
          { status: 409 }
        );
      } else {
        // El endpoint ya está registrado para el mismo usuario, actualizar last_used_at
        await execute(
          `UPDATE push_subscriptions
           SET last_used_at = NOW(), user_agent = $1, device_type = $2
           WHERE endpoint = $3`,
          [userAgent || null, deviceType || null, endpoint]
        );

        console.log(`[Push Subscribe] Suscripción actualizada para ${userEmail}`);
        return NextResponse.json({
          success: true,
          message: 'Suscripción actualizada',
          updated: true
        });
      }
    }

    // Insertar nueva suscripción
    await execute(
      `INSERT INTO push_subscriptions
       (user_email, endpoint, p256dh_key, auth_key, device_type, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userEmail, endpoint, keys.p256dh, keys.auth, deviceType || null, userAgent || null]
    );

    console.log(`[Push Subscribe] Nueva suscripción registrada para ${userEmail}`);

    return NextResponse.json({
      success: true,
      message: 'Suscripción registrada exitosamente',
      created: true
    });

  } catch (error) {
    console.error('Error en push subscribe:', error);
    // Incluir más detalles del error para debugging
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: 'Error interno del servidor', details: errorMessage },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar suscripción push
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, userEmail } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Se requiere endpoint' },
        { status: 400 }
      );
    }

    let deleteQuery = 'DELETE FROM push_subscriptions WHERE endpoint = $1';
    const params: string[] = [endpoint];

    // Si se proporciona userEmail, solo eliminar si coincide
    if (userEmail) {
      deleteQuery += ' AND user_email = $2';
      params.push(userEmail);
    }

    await execute(deleteQuery, params);
    console.log(`[Push Subscribe] Suscripción eliminada para endpoint`);

    return NextResponse.json({
      success: true,
      message: 'Suscripción eliminada'
    });

  } catch (error) {
    console.error('Error eliminando suscripción:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// GET - Obtener estado de suscripciones de un usuario
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('userEmail');

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Se requiere userEmail' },
        { status: 400 }
      );
    }

    const subscriptions = await query<{
      id: number;
      device_type: string;
      created_at: Date;
      last_used_at: Date;
    }>(
      `SELECT id, device_type, created_at, last_used_at
       FROM push_subscriptions
       WHERE user_email = $1
       ORDER BY last_used_at DESC`,
      [userEmail]
    );

    return NextResponse.json({
      success: true,
      count: subscriptions.length,
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        deviceType: s.device_type,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at
      }))
    });

  } catch (error) {
    console.error('Error obteniendo suscripciones:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
