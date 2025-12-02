// src/components/modals/TicketListModal.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, FileText, Eye, Plus, Clock, Check, AlertCircle, ChevronDown, Filter } from 'lucide-react';
import type { Ticket } from '@/types';
import { getStatusStyle, getStatusLabel, getPriorityStyle, getPriorityLabel } from '@/utils';
import { StarRating } from '../StarRating';
import { SatisfactionModal } from './SatisfactionModal';
import { getTicketSatisfaction, updateSatisfactionStatus, TicketSatisfaction } from '@/services/glpiApi';
import { useTicketUpdates } from '@/hooks/useTicketUpdates';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface TicketListModalProps {
  email: string;
  userId?: number;
  userName?: string;
  tickets: Ticket[];
  isLoading: boolean;
  onViewDetail: (ticket: Ticket) => void;
  onClose: () => void;
  sessionToken?: string | null;
  onTicketsUpdate?: (tickets: Ticket[]) => void;
  onTicketUpdated?: (ticketId: number) => void; // Callback cuando un ticket específico es actualizado via SSE
}

// Orden de prioridad para mostrar los estados en el filtro
const STATUS_ORDER: Record<string, number> = {
  'nuevo': 1,
  'pendiente': 2,
  'en-progreso': 3,
  'resuelto': 4,
  'cerrado': 5,
};

function getStatusIcon(status: string) {
  switch (status) {
    case 'nuevo':
      return <Plus className="w-4 h-4" />;
    case 'pendiente':
      return <Clock className="w-4 h-4" />;
    case 'en-progreso':
      return <AlertCircle className="w-4 h-4" />;
    case 'resuelto':
      return <Check className="w-4 h-4" />;
    case 'cerrado':
      return <Check className="w-4 h-4" />;
    default:
      return null;
  }
}

export function TicketListModal({
  email,
  userId,
  userName,
  tickets: initialTickets,
  isLoading,
  onViewDetail,
  onClose,
  sessionToken,
  onTicketsUpdate,
  onTicketUpdated,
}: TicketListModalProps) {
  // Estado local de tickets para actualizaciones en tiempo real
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);

  // Estado del filtro - 'todos' significa sin filtro
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Estados para satisfacción
  // 'loading' = cargando, null = sin encuesta, TicketSatisfaction = tiene encuesta
  const [satisfactions, setSatisfactions] = useState<Record<number, TicketSatisfaction | null | 'loading'>>({});
  const [satisfactionModal, setSatisfactionModal] = useState<{
    isOpen: boolean;
    ticketId: number;
    ticketName: string;
    satisfactionId: number;
  } | null>(null);

  // Hook para sonidos de notificación
  const { playTicketUpdated } = useNotificationSound();

  // Hook para actualizaciones en tiempo real via SSE
  useTicketUpdates(tickets, setTickets, {
    enabled: !isLoading && tickets.length > 0,
    onUpdate: (update) => {
      console.log('[TicketListModal] onUpdate callback recibido:', update);

      // Reproducir sonido de actualización
      playTicketUpdated();

      // Notificar al padre si hay callback
      if (onTicketsUpdate) {
        onTicketsUpdate(tickets);
      }
      // Notificar que un ticket específico fue actualizado (para refrescar el modal de detalle)
      if (onTicketUpdated && update.ticketId) {
        console.log('[TicketListModal] Llamando onTicketUpdated con ticketId:', update.ticketId);
        onTicketUpdated(update.ticketId);
      } else {
        console.log('[TicketListModal] onTicketUpdated no definido o sin ticketId:', { onTicketUpdated: !!onTicketUpdated, ticketId: update.ticketId });
      }
    }
  });

  // Sincronizar con props cuando cambian los tickets iniciales
  useEffect(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  // Cargar encuestas para tickets cerrados y actualizar status si es necesario
  useEffect(() => {
    const loadSatisfactions = async () => {
      if (!sessionToken || !userId) return;

      const closedTickets = tickets.filter(t => t.status === 'cerrado');

      for (const ticket of closedTickets) {
        // Solo cargar si no existe en el estado (no ha sido procesado)
        if (!(ticket.rawId in satisfactions)) {
          // Marcar como "cargando"
          setSatisfactions(prev => ({ ...prev, [ticket.rawId]: 'loading' }));

          const satisfaction = await getTicketSatisfaction(sessionToken, ticket.rawId);

          // Si la encuesta existe y está en estado 'draft', cambiarla a 'pending'
          // porque el ticket ya está cerrado
          if (satisfaction && satisfaction.status === 'draft') {
            console.log(`[TicketListModal] Ticket ${ticket.rawId} cerrado, cambiando encuesta de draft a pending`);
            await updateSatisfactionStatus(ticket.rawId, userId, 'pending');
            // Actualizar el objeto local con el nuevo status
            satisfaction.status = 'pending';
          }

          setSatisfactions(prev => ({ ...prev, [ticket.rawId]: satisfaction }));
        }
      }
    };

    if (tickets.length > 0 && sessionToken) {
      loadSatisfactions();
    }
  }, [tickets, sessionToken, userId]);

  // Calcular los estados únicos que existen en los tickets del usuario
  const availableStatuses = useMemo(() => {
    const uniqueStatuses = [...new Set(tickets.map(t => t.status))];
    // Ordenar según el orden definido
    return uniqueStatuses.sort((a, b) => (STATUS_ORDER[a] || 99) - (STATUS_ORDER[b] || 99));
  }, [tickets]);

  // Filtrar tickets según el estado seleccionado
  const filteredTickets = useMemo(() => {
    if (statusFilter === 'todos') return tickets;
    return tickets.filter(t => t.status === statusFilter);
  }, [tickets, statusFilter]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-4xl min-h-screen sm:min-h-0 sm:max-h-[90vh] flex flex-col animate-in zoom-in duration-200 sm:my-4">
        {/* Header Fijo */}
        <div className="flex-shrink-0 sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-6 rounded-t-3xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                Mis Tickets
              </h3>
              <p className="text-slate-600 text-xs sm:text-sm mt-1 truncate">
                {email || 'ejemplo@correo.com'}
              </p>
            </div>

            {/* Filtro por estado */}
            {!isLoading && tickets.length > 0 && (
              <div className="relative flex-shrink-0 mx-2 sm:mx-4 flex items-center">
                <Filter className="w-4 h-4 text-slate-500 mr-2" />
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-colors"
                  >
                    <option value="todos">Todos</option>
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {getStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="flex-shrink-0 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Contenido con Scroll */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
          {/* Estado de carga */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-slate-600">Cargando tickets...</p>
              </div>
            </div>
          )}

          {/* Lista de tickets */}
          {!isLoading && tickets.length > 0 && (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 transition-colors bg-white"
                >
                  <div className="p-4 sm:p-6">
                    {/* Header del Ticket */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        {/* ID y Estado */}
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span className="text-base sm:text-lg font-mono font-bold text-blue-600">
                            TK-{ticket.rawId}
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs font-medium"
                            style={getStatusStyle(ticket.status)}
                          >
                            {getStatusIcon(ticket.status)}
                            <span>{getStatusLabel(ticket.status)}</span>
                          </span>
                        </div>

                        {/* Asunto */}
                        <h4 className="font-semibold text-slate-900 text-base sm:text-lg mb-2 leading-tight">
                          {ticket.subject}
                        </h4>

                        {/* Fecha y Prioridad */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-600">
                          <span className="whitespace-nowrap">{ticket.date || 'Sin fecha'}</span>
                          <span
                            className="inline-flex items-center px-3 py-1 rounded text-xs font-medium whitespace-nowrap"
                            style={getPriorityStyle(ticket.priority)}
                          >
                            {getPriorityLabel(ticket.priority)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Detalles del ticket */}
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      {/* Información en Grid Responsive */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                        <div className="flex items-start sm:items-center gap-2">
                          <span className="text-slate-600 flex-shrink-0">Categoría:</span>
                          <span className="font-medium text-slate-900">{ticket.category}</span>
                        </div>
                        <div className="flex items-start sm:items-center gap-2">
                          <span className="text-slate-600 flex-shrink-0">Asignado a:</span>
                          <span className="font-medium text-slate-900 break-words">
                            {ticket.assignedTo}
                            {ticket.group && <span className="text-slate-500 text-xs ml-1">({ticket.group})</span>}
                          </span>
                        </div>
                      </div>

                      {/* Última Actualización */}
                      {ticket.lastUpdate && (
                        <div className="p-3 sm:p-4 bg-slate-50 rounded-xl">
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            <strong className="block sm:inline">Última actualización:</strong>
                            {ticket.lastUpdateDate && (
                              <span className="text-slate-500 text-xs ml-1">
                                ({ticket.lastUpdateDate.includes('T')
                                  ? new Date(ticket.lastUpdateDate).toLocaleString('es-CO', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true,
                                    })
                                  : ticket.lastUpdateDate})
                              </span>
                            )}
                            <span className="block mt-1">
                              {ticket.lastUpdate}
                            </span>
                          </p>
                        </div>
                      )}

                      {/* Fila con Calificación y Botón Ver Detalle */}
                      <div className="flex items-center justify-between mt-3">
                        {/* Calificación - Solo para tickets cerrados */}
                        {ticket.status === 'cerrado' && sessionToken ? (
                          <div className="flex items-center gap-2">
                            {satisfactions[ticket.rawId] === 'loading' ? (
                              <span className="text-sm text-gray-400">Cargando...</span>
                            ) : satisfactions[ticket.rawId] && typeof satisfactions[ticket.rawId] === 'object' && (satisfactions[ticket.rawId] as TicketSatisfaction).satisfaction ? (
                              // Ya calificó (status: completed) - mostrar estrellas llenas
                              <>
                                <StarRating rating={(satisfactions[ticket.rawId] as TicketSatisfaction).satisfaction} readonly size={20} />
                              </>
                            ) : satisfactions[ticket.rawId] && typeof satisfactions[ticket.rawId] === 'object' && (satisfactions[ticket.rawId] as TicketSatisfaction).status === 'pending' ? (
                              // Encuesta pendiente (status: pending) - permitir calificar
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSatisfactionModal({
                                    isOpen: true,
                                    ticketId: ticket.rawId,
                                    ticketName: ticket.subject,
                                    satisfactionId: (satisfactions[ticket.rawId] as TicketSatisfaction).id,
                                  });
                                }}
                                className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
                              >
                                <StarRating rating={null} readonly size={20} />
                                <span className="underline">Calificar atención</span>
                              </button>
                            ) : !satisfactions[ticket.rawId] ? (
                              // No hay encuesta (legacy o error) - permitir calificar creando nueva
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSatisfactionModal({
                                    isOpen: true,
                                    ticketId: ticket.rawId,
                                    ticketName: ticket.subject,
                                    satisfactionId: 0,
                                  });
                                }}
                                className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
                              >
                                <StarRating rating={null} readonly size={20} />
                                <span className="underline">Calificar atención</span>
                              </button>
                            ) : (
                              // Status draft u otro - no mostrar nada (no debería pasar)
                              <div></div>
                            )}
                          </div>
                        ) : (
                          <div></div>
                        )}

                        {/* Botón Ver Detalle */}
                        <button
                          onClick={() => onViewDetail(ticket)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 font-medium text-sm rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                        >
                          <Eye className="w-4 h-4" />
                          Ver Detalle
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Estado Vacío - Sin tickets */}
          {!isLoading && tickets.length === 0 && (
            <div className="text-center py-12 sm:py-16">
              <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-base sm:text-lg">No tienes tickets registrados</p>
              <p className="text-slate-400 text-sm mt-2">Crea tu primer ticket de soporte</p>
            </div>
          )}

          {/* Estado Vacío - Filtro sin resultados */}
          {!isLoading && tickets.length > 0 && filteredTickets.length === 0 && (
            <div className="text-center py-12 sm:py-16">
              <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-base sm:text-lg">
                No hay tickets con estado &quot;{getStatusLabel(statusFilter)}&quot;
              </p>
              <button
                onClick={() => setStatusFilter('todos')}
                className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              >
                Ver todos los tickets
              </button>
            </div>
          )}
        </div>

        {/* Footer con Indicador de Scroll */}
        <div className="flex-shrink-0 bg-gradient-to-t from-white via-white to-transparent px-4 sm:px-8 py-3 sm:py-4 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600">
            <span className="font-medium">
              {statusFilter === 'todos'
                ? `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} en total`
                : `${filteredTickets.length} de ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`
              }
            </span>
            <span className="text-slate-400 hidden sm:inline">Desliza para ver más</span>
          </div>
        </div>
      </div>

      {/* Modal de Satisfacción */}
      {satisfactionModal && sessionToken && (
        <SatisfactionModal
          isOpen={satisfactionModal.isOpen}
          onClose={() => setSatisfactionModal(null)}
          ticketId={satisfactionModal.ticketId}
          ticketName={satisfactionModal.ticketName}
          satisfactionId={satisfactionModal.satisfactionId}
          sessionToken={sessionToken}
          userId={userId}
          userEmail={email}
          userName={userName}
          onSuccess={() => {
            // Recargar la encuesta del ticket
            getTicketSatisfaction(sessionToken, satisfactionModal.ticketId).then(satisfaction => {
              setSatisfactions(prev => ({ ...prev, [satisfactionModal.ticketId]: satisfaction }));
            });
          }}
        />
      )}
    </div>
  );
}
