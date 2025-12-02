// scripts/run-migration.ts
// Script para ejecutar migraciones de base de datos

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno manualmente
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const DATABASE_URL = envVars.DATABASE_URL || process.env.DATABASE_URL;
const DATABASE_SCHEMA = envVars.DATABASE_SCHEMA || process.env.DATABASE_SCHEMA || 'ticket_portal';

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no está configurado');
  process.exit(1);
}

console.log('Conectando a la base de datos...');
console.log(`Schema: ${DATABASE_SCHEMA}`);

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    // Leer el archivo de migración
    const migrationPath = path.join(__dirname, '..', 'src', 'lib', 'migrations', '003_satisfaction_status.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('\n=== Ejecutando migración 003_satisfaction_status ===\n');

    // Ejecutar la migración
    await client.query(migrationSQL);

    console.log('\n=== Migración completada exitosamente ===\n');

    // Verificar que la columna existe
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = $1
      AND table_name = 'ticket_satisfaction'
      AND column_name = 'status'
    `, [DATABASE_SCHEMA]);

    if (result.rows.length > 0) {
      console.log('Columna status creada:');
      console.log(result.rows[0]);
    } else {
      console.log('ADVERTENCIA: La columna status no se encontró después de la migración');
    }

    // Mostrar estadísticas
    const stats = await client.query(`
      SELECT status, COUNT(*) as count
      FROM ${DATABASE_SCHEMA}.ticket_satisfaction
      GROUP BY status
    `);

    console.log('\nEstadísticas de encuestas por status:');
    stats.rows.forEach(row => {
      console.log(`  ${row.status || 'NULL'}: ${row.count}`);
    });

  } catch (error) {
    console.error('ERROR ejecutando migración:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('\nProceso completado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nProceso fallido:', error);
    process.exit(1);
  });
