// src/lib/db.ts
import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || 'ticket_portal';

if (!DATABASE_URL) {
  console.warn('DATABASE_URL no está configurada');
}

// Pool de conexiones singleton
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool && DATABASE_URL) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Error inesperado en el pool de PostgreSQL:', err);
    });
  }

  if (!pool) {
    throw new Error('No se pudo crear el pool de conexiones. DATABASE_URL no configurada.');
  }

  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Establecer el schema para esta conexión
    await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function execute(
  text: string,
  params?: unknown[]
): Promise<{ rowCount: number }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
    const result = await client.query(text, params);
    return { rowCount: result.rowCount || 0 };
  } finally {
    client.release();
  }
}

export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  const client = await pool.connect();
  await client.query(`SET search_path TO ${DATABASE_SCHEMA}, public`);
  return client;
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { DATABASE_SCHEMA };
