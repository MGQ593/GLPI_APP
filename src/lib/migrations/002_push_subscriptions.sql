-- Migration: 002_push_subscriptions
-- Descripción: Crea la tabla para almacenar suscripciones de push notifications
-- Fecha: 2024-11-29

-- Establecer el search_path
SET search_path TO ticket_portal, public;

-- Tabla de suscripciones push
-- Almacena los endpoints y claves de cada dispositivo para enviar notificaciones
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,

    -- Email del usuario (identificador principal)
    user_email VARCHAR(255) NOT NULL,

    -- Datos de la suscripción Push (del navegador)
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,

    -- Información del dispositivo (opcional, para referencia)
    device_type VARCHAR(50), -- 'desktop', 'mobile', 'tablet'
    user_agent TEXT,

    -- Metadatos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Un endpoint solo puede existir una vez (es único por dispositivo/navegador)
    CONSTRAINT uk_endpoint UNIQUE (endpoint)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_push_user_email ON push_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_push_created ON push_subscriptions(created_at);

-- Registrar esta migración
INSERT INTO schema_migrations (migration_name)
VALUES ('002_push_subscriptions')
ON CONFLICT (migration_name) DO NOTHING;

-- Comentarios para documentación
COMMENT ON TABLE push_subscriptions IS 'Almacena suscripciones de Web Push para notificaciones';
COMMENT ON COLUMN push_subscriptions.user_email IS 'Email del usuario para relacionar con GLPI';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'URL del endpoint Push del navegador (único por dispositivo)';
COMMENT ON COLUMN push_subscriptions.p256dh_key IS 'Clave pública del cliente para encriptación';
COMMENT ON COLUMN push_subscriptions.auth_key IS 'Secret de autenticación del cliente';
COMMENT ON COLUMN push_subscriptions.device_type IS 'Tipo de dispositivo: desktop, mobile, tablet';
