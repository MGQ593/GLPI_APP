-- Migration: 003_satisfaction_status
-- Descripción: Agrega columna status a ticket_satisfaction para manejar estados draft/pending/completed
-- Fecha: 2024-11-30

-- Establecer el search_path
SET search_path TO ticket_portal, public;

-- Agregar columna status con valor por defecto 'draft'
-- Estados: draft (ticket abierto), pending (ticket cerrado, esperando calificación), completed (calificado)
ALTER TABLE ticket_satisfaction
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'
CHECK (status IN ('draft', 'pending', 'completed'));

-- Hacer satisfaction nullable para encuestas en estado draft/pending
ALTER TABLE ticket_satisfaction
ALTER COLUMN satisfaction DROP NOT NULL;

-- Actualizar registros existentes: si tienen satisfaction, están completados
UPDATE ticket_satisfaction
SET status = 'completed'
WHERE satisfaction IS NOT NULL AND status IS NULL;

-- Si hay registros sin satisfaction, están pendientes (legacy)
UPDATE ticket_satisfaction
SET status = 'pending'
WHERE satisfaction IS NULL AND status IS NULL;

-- Índice para búsquedas por status
CREATE INDEX IF NOT EXISTS idx_satisfaction_status ON ticket_satisfaction(status);

-- Registrar esta migración
INSERT INTO schema_migrations (migration_name)
VALUES ('003_satisfaction_status')
ON CONFLICT (migration_name) DO NOTHING;

-- Comentarios para documentación
COMMENT ON COLUMN ticket_satisfaction.status IS 'Estado de la encuesta: draft (ticket abierto), pending (ticket cerrado, esperando calificación), completed (calificado)';
