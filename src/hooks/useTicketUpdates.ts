// src/hooks/useTicketUpdates.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Ticket } from '@/types';

interface TicketUpdateEvent {
  ticketId: number;
  status?: number;
  statusLabel?: string;
  priority?: number;
  priorityLabel?: string;
  assignedTo?: string;
  group?: string;
  category?: string;
  lastUpdate?: string;
  lastUpdateDate?: string;
  updatedAt: string;
  eventType: 'update' | 'new' | 'delete';
}

interface UseTicketUpdatesOptions {
  enabled?: boolean;
  onUpdate?: (update: TicketUpdateEvent) => void;
}

export function useTicketUpdates(
  tickets: Ticket[],
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>,
  options: UseTicketUpdatesOptions = {}
) {
  const { enabled = true, onUpdate } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);

  // Refs para evitar re-renders
  const onUpdateRef = useRef(onUpdate);
  const setTicketsRef = useRef(setTickets);

  // Actualizar refs cuando cambien
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    setTicketsRef.current = setTickets;
  }, [setTickets]);

  // Función para formatear fecha ISO a formato legible
  const formatDateForDisplay = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) {
        return isoDate; // Si no es válida, retornar el original
      }
      return date.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoDate;
    }
  };

  // Aplicar actualización a un ticket específico
  const applyUpdate = useCallback((update: TicketUpdateEvent) => {
    setTicketsRef.current(prevTickets => {
      return prevTickets.map(ticket => {
        if (ticket.rawId !== update.ticketId) {
          return ticket;
        }

        // Actualizar solo los campos que vienen en el update
        const updatedTicket = { ...ticket };

        if (update.statusLabel) {
          updatedTicket.status = update.statusLabel;
        }
        if (update.status !== undefined) {
          updatedTicket.statusCode = update.status;
        }
        if (update.assignedTo) {
          updatedTicket.assignedTo = update.assignedTo;
        }
        if (update.group) {
          updatedTicket.group = update.group;
        }
        if (update.priorityLabel) {
          updatedTicket.priority = update.priorityLabel;
        }
        if (update.category) {
          // Extraer solo la última parte de la categoría (después del último ">")
          const categoryParts = update.category.split('>');
          updatedTicket.category = categoryParts[categoryParts.length - 1].trim();
        }
        if (update.lastUpdate) {
          updatedTicket.lastUpdate = update.lastUpdate;
        }
        if (update.lastUpdateDate) {
          // Formatear la fecha para mostrarla correctamente
          updatedTicket.lastUpdateDate = formatDateForDisplay(update.lastUpdateDate);
        }

        console.log(`[SSE] Ticket ${update.ticketId} actualizado:`, updatedTicket);
        return updatedTicket;
      });
    });

    setLastUpdate(new Date());

    // Callback opcional
    if (onUpdateRef.current) {
      console.log('[SSE] Ejecutando callback onUpdate para ticket:', update.ticketId);
      onUpdateRef.current(update);
    } else {
      console.log('[SSE] No hay callback onUpdate definido');
    }
  }, []);

  // Desconectar
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectedRef.current = false;
    setIsConnected(false);
  }, []);

  // Conectar al stream de eventos
  const connect = useCallback(() => {
    // Evitar conexiones múltiples
    if (isConnectedRef.current || eventSourceRef.current) {
      return;
    }

    console.log('[SSE] Conectando al stream de tickets...');
    isConnectedRef.current = true;

    const eventSource = new EventSource('/api/tickets/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Conexión establecida');
      setIsConnected(true);
    };

    eventSource.addEventListener('connected', (event) => {
      console.log('[SSE] Evento connected:', event.data);
    });

    eventSource.addEventListener('ticket-update', (event) => {
      try {
        const update: TicketUpdateEvent = JSON.parse(event.data);
        console.log('[SSE] Actualización de ticket recibida:', update);
        applyUpdate(update);
      } catch (error) {
        console.error('[SSE] Error parseando evento:', error);
      }
    });

    eventSource.addEventListener('heartbeat', () => {
      // Heartbeat recibido, conexión activa
    });

    eventSource.onerror = (error) => {
      console.error('[SSE] Error en conexión:', error);
      setIsConnected(false);
      isConnectedRef.current = false;
      eventSource.close();
      eventSourceRef.current = null;

      // Reconectar después de 5 segundos
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[SSE] Intentando reconectar...');
        connect();
      }, 5000);
    };
  }, [applyUpdate]);

  // Efecto principal - solo se ejecuta cuando cambia enabled o hay tickets
  useEffect(() => {
    // Solo conectar si está habilitado y hay tickets
    const shouldConnect = enabled && tickets.length > 0;

    if (shouldConnect && !eventSourceRef.current) {
      connect();
    } else if (!shouldConnect && eventSourceRef.current) {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, tickets.length > 0]); // Nota: usamos tickets.length > 0 como booleano

  return {
    isConnected,
    lastUpdate,
    reconnect: connect,
    disconnect,
  };
}
