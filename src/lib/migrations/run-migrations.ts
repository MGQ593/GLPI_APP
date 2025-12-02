// src/lib/migrations/run-migrations.ts
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

export async function runMigrations(): Promise<{ success: boolean; message: string; executed: string[] }> {
  if (!DATABASE_URL) {
    return { success: false, message: 'DATABASE_URL no configurada', executed: [] };
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const executed: string[] = [];

  try {
    const client = await pool.connect();

    try {
      // Obtener todos los archivos .sql en el directorio de migraciones
      const migrationsDir = path.join(process.cwd(), 'src/lib/migrations');
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Ordenar para ejecutar en orden numérico

      for (const file of files) {
        const migrationPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Ejecutar la migración
        await client.query(sql);
        executed.push(file);
        console.log(`Migración ejecutada: ${file}`);
      }

      return { success: true, message: `${executed.length} migración(es) ejecutada(s) correctamente`, executed };
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error ejecutando migración:', errorMessage);
    return { success: false, message: `Error: ${errorMessage}`, executed };
  } finally {
    await pool.end();
  }
}

// Función para verificar si el schema existe
export async function checkSchemaExists(): Promise<boolean> {
  if (!DATABASE_URL) {
    return false;
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name = 'ticket_portal'
        ) as exists
      `);

      return result.rows[0]?.exists === true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error verificando schema:', error);
    return false;
  } finally {
    await pool.end();
  }
}

// Función para verificar la conexión
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!DATABASE_URL) {
    return { success: false, message: 'DATABASE_URL no configurada' };
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const client = await pool.connect();

    try {
      const result = await client.query('SELECT NOW() as current_time, current_database() as database');
      const { current_time, database } = result.rows[0];

      return {
        success: true,
        message: `Conectado a ${database} - Hora del servidor: ${current_time}`
      };
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Error de conexión: ${errorMessage}` };
  } finally {
    await pool.end();
  }
}
