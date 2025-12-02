-- Migration: 001_create_schema
-- Descripción: Crea el schema ticket_portal y las tablas para encuestas de satisfacción
-- Fecha: 2024-11-26

-- Crear el schema si no existe
CREATE SCHEMA IF NOT EXISTS ticket_portal;

-- Establecer el search_path
SET search_path TO ticket_portal, public;

-- Tabla de encuestas de satisfacción
-- Almacena las calificaciones de los tickets cerrados
CREATE TABLE IF NOT EXISTS ticket_satisfaction (
    id SERIAL PRIMARY KEY,

    -- Relación con GLPI (solo guardamos IDs, no foreign keys)
    glpi_ticket_id INTEGER NOT NULL,
    glpi_user_id INTEGER NOT NULL,

    -- Datos del usuario para referencia rápida
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),

    -- Datos del ticket para referencia rápida
    ticket_subject VARCHAR(500),
    ticket_closed_date TIMESTAMP,

    -- Calificación
    satisfaction INTEGER NOT NULL CHECK (satisfaction >= 1 AND satisfaction <= 5),
    comment TEXT,

    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Un usuario solo puede calificar un ticket una vez
    CONSTRAINT uk_ticket_user UNIQUE (glpi_ticket_id, glpi_user_id)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_satisfaction_ticket ON ticket_satisfaction(glpi_ticket_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_user ON ticket_satisfaction(glpi_user_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_email ON ticket_satisfaction(user_email);
CREATE INDEX IF NOT EXISTS idx_satisfaction_created ON ticket_satisfaction(created_at);

-- Tabla de historial de migraciones
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Registrar esta migración
INSERT INTO schema_migrations (migration_name)
VALUES ('001_create_schema')
ON CONFLICT (migration_name) DO NOTHING;

-- Comentarios para documentación
COMMENT ON TABLE ticket_satisfaction IS 'Almacena las calificaciones de satisfacción de tickets cerrados de GLPI';
COMMENT ON COLUMN ticket_satisfaction.glpi_ticket_id IS 'ID del ticket en GLPI';
COMMENT ON COLUMN ticket_satisfaction.glpi_user_id IS 'ID del usuario en GLPI';
COMMENT ON COLUMN ticket_satisfaction.satisfaction IS 'Calificación de 1 a 5 estrellas';
