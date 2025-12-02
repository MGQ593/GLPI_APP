// src/components/ErrorLogger.tsx
'use client';

import { useEffect } from 'react';
import { logger } from '@/services/logger';

export function ErrorLogger({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logger.error(`Uncaught Error: ${event.message}`, {
        file: event.filename,
        line: event.lineno,
        col: event.colno,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      logger.error('Unhandled Promise Rejection', {
        reason: String(event.reason),
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    logger.info('App iniciada');

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return <>{children}</>;
}
