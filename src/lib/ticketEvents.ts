// src/lib/ticketEvents.ts
// Sistema de eventos para notificaciones de tickets en tiempo real

type TicketUpdateListener = (update: TicketUpdate) => void;

export interface TicketUpdate {
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
  updatedAt: Date;
  eventType: 'update' | 'new' | 'delete';
}

class TicketEventEmitter {
  private listeners: Set<TicketUpdateListener> = new Set();
  private pendingUpdates: Map<number, TicketUpdate> = new Map();

  constructor() {
    console.log('[TicketEvents] Instancia creada');
  }

  // Agregar un listener
  subscribe(listener: TicketUpdateListener): () => void {
    this.listeners.add(listener);
    console.log(`[TicketEvents] Listener agregado. Total: ${this.listeners.size}`);

    // Retornar función para desuscribirse
    return () => {
      this.listeners.delete(listener);
      console.log(`[TicketEvents] Listener removido. Total: ${this.listeners.size}`);
    };
  }

  // Emitir un evento a todos los listeners
  emit(update: TicketUpdate): void {
    console.log(`[TicketEvents] Emitiendo evento para ticket ${update.ticketId}. Listeners: ${this.listeners.size}`);

    // Guardar la actualización
    this.pendingUpdates.set(update.ticketId, update);

    // Notificar a todos los listeners
    this.listeners.forEach(listener => {
      try {
        listener(update);
      } catch (error) {
        console.error('[TicketEvents] Error en listener:', error);
      }
    });

    // Limpiar actualizaciones antiguas (más de 5 minutos)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    this.pendingUpdates.forEach((value, key) => {
      if (value.updatedAt < fiveMinutesAgo) {
        this.pendingUpdates.delete(key);
      }
    });
  }

  // Obtener actualizaciones pendientes para ciertos tickets
  getPendingUpdates(ticketIds?: number[]): TicketUpdate[] {
    if (!ticketIds) {
      return Array.from(this.pendingUpdates.values());
    }
    return ticketIds
      .map(id => this.pendingUpdates.get(id))
      .filter((update): update is TicketUpdate => update !== undefined);
  }

  // Limpiar una actualización después de procesarla
  clearUpdate(ticketId: number): void {
    this.pendingUpdates.delete(ticketId);
  }

  // Obtener cantidad de listeners activos
  getListenerCount(): number {
    return this.listeners.size;
  }
}

// Usar globalThis para persistir el singleton entre recargas de módulo en desarrollo
const globalForTicketEvents = globalThis as unknown as {
  ticketEvents: TicketEventEmitter | undefined;
};

export const ticketEvents = globalForTicketEvents.ticketEvents ?? new TicketEventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForTicketEvents.ticketEvents = ticketEvents;
}
