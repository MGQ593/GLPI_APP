// src/app/api/db/route.ts
import { NextResponse } from 'next/server';
import { testConnection, runMigrations, checkSchemaExists } from '@/lib/migrations/run-migrations';

// GET - Test de conexión y estado
export async function GET() {
  try {
    const connectionTest = await testConnection();
    const schemaExists = await checkSchemaExists();

    return NextResponse.json({
      connection: connectionTest,
      schemaExists,
      databaseUrl: process.env.DATABASE_URL ? 'Configurada' : 'No configurada',
      schema: process.env.DATABASE_SCHEMA || 'ticket_portal',
    });
  } catch (error) {
    console.error('Error en GET /api/db:', error);
    return NextResponse.json(
      { error: 'Error interno', details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Ejecutar migraciones
export async function POST() {
  try {
    const result = await runMigrations();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error en POST /api/db:', error);
    return NextResponse.json(
      { error: 'Error interno', details: String(error) },
      { status: 500 }
    );
  }
}
