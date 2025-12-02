// src/services/logger.ts

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private sendToFile(level: LogLevel, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();

    // Solo enviar a archivo si estamos en el cliente
    if (typeof window !== 'undefined') {
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, data, timestamp }),
      }).catch(() => {}); // Silenciar errores del logger
    }
  }

  info(message: string, data?: unknown) {
    console.info(`[INFO] ${message}`, data ?? '');
    this.sendToFile('info', message, data);
  }

  warn(message: string, data?: unknown) {
    console.warn(`[WARN] ${message}`, data ?? '');
    this.sendToFile('warn', message, data);
  }

  error(message: string, data?: unknown) {
    console.error(`[ERROR] ${message}`, data ?? '');
    this.sendToFile('error', message, data);
  }

  debug(message: string, data?: unknown) {
    console.log(`[DEBUG] ${message}`, data ?? '');
    this.sendToFile('debug', message, data);
  }
}

export const logger = new Logger();
