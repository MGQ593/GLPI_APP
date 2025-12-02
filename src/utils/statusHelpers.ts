// src/utils/statusHelpers.ts
import React from 'react';

export function getStatusStyle(status: string): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    'nuevo': { backgroundColor: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' },
    'pendiente': { backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' },
    'en-progreso': { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
    'resuelto': { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
    'cerrado': { backgroundColor: '#e2e8f0', color: '#475569', border: '1px solid #cbd5e1' },
  };
  return styles[status] || { backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' };
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'nuevo':
      return 'Nuevo';
    case 'pendiente':
      return 'Pendiente';
    case 'en-progreso':
      return 'En Progreso';
    case 'resuelto':
      return 'Resuelto';
    case 'cerrado':
      return 'Cerrado';
    default:
      return status;
  }
}

export function getPriorityStyle(priority: string): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    'muy-alta': { backgroundColor: '#fef2f2', color: '#dc2626', border: '2px solid #dc2626' },
    'mayor': { backgroundColor: '#fef2f2', color: '#dc2626', border: '2px solid #dc2626' },
    'alta': { backgroundColor: '#fff7ed', color: '#ea580c', border: '2px solid #ea580c' },
    'media': { backgroundColor: '#fefce8', color: '#ca8a04', border: '2px solid #eab308' },
    'baja': { backgroundColor: '#f0fdf4', color: '#16a34a', border: '2px solid #16a34a' },
    'muy-baja': { backgroundColor: '#f9fafb', color: '#6b7280', border: '2px solid #6b7280' },
  };
  return styles[priority] || { backgroundColor: '#f9fafb', color: '#6b7280', border: '2px solid #6b7280' };
}

export function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'muy-alta':
      return 'Prioridad Muy Alta';
    case 'mayor':
      return 'Prioridad Mayor';
    case 'alta':
      return 'Prioridad Alta';
    case 'media':
      return 'Prioridad Media';
    case 'baja':
      return 'Prioridad Baja';
    case 'muy-baja':
      return 'Prioridad Muy Baja';
    default:
      return `Prioridad ${priority}`;
  }
}
