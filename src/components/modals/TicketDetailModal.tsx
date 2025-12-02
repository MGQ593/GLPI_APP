// src/components/modals/TicketDetailModal.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { X, ArrowLeft, Maximize2, Minimize2, Clock, FileText, Mail, MessageSquare, Loader2, Check, AlertCircle, Send, Plus, Paperclip, Image, File, Download, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { Ticket, TimelineMessage, CommentAttachment } from '@/types';
import { getStatusStyle, getStatusLabel, getPriorityStyle, getPriorityLabel, sanitizeHtml, formatFileSize } from '@/utils';
import { approveSolution, rejectSolution, sendFollowup } from '@/services/glpiApi';

interface TicketDetailModalProps {
  ticket: Ticket;
  timelineMessages: TimelineMessage[];
  isLoading: boolean;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  newComment: string;
  setNewComment: (comment: string) => void;
  isSendingComment: boolean;
  commentSuccess: string | null;
  commentError: string | null;
  commentTextareaRef: React.RefObject<HTMLInputElement>;
  onSendComment: () => void;
  onClose: () => void;
  // Attachment props
  attachments: CommentAttachment[];
  attachmentFileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (id: string) => void;
  hasAttachments: boolean;
  attachmentError: string | null;
  // Session token for document URLs
  sessionToken: string | null;
  // Solution approval/rejection
  onRefreshTimeline: () => void;
  loggedInUserId?: number;
}

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

export function TicketDetailModal({
  ticket,
  timelineMessages,
  isLoading,
  isExpanded,
  setIsExpanded,
  newComment,
  setNewComment,
  isSendingComment,
  commentSuccess,
  commentError,
  commentTextareaRef,
  onSendComment,
  onClose,
  attachments,
  attachmentFileInputRef,
  onFileSelect,
  onRemoveAttachment,
  hasAttachments,
  attachmentError,
  sessionToken,
  onRefreshTimeline,
  loggedInUserId,
}: TicketDetailModalProps) {
  // Detectar si hay una solución pendiente de aprobación
  // IMPORTANTE: Solo considerar la última solución, ya que en GLPI cuando se rechaza y se agrega otra,
  // la anterior queda como rechazada y solo la nueva importa
  const lastSolution = timelineMessages
    .filter(m => m.type === 'solution' && m.solution)
    .pop();
  const hasPendingSolution = lastSolution && Number(lastSolution.solution?.status) === 2;

  // Helper para determinar si un mensaje es del usuario logueado (para posicionamiento)
  const isMyMessage = (message: TimelineMessage) => {
    return loggedInUserId !== undefined && message.userId === loggedInUserId;
  };

  // Ref para auto-scroll al final de los mensajes
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  // Auto-scroll solo cuando:
  // 1. Es la carga inicial del modal
  // 2. Hay mensajes nuevos Y el usuario está cerca del final (dentro de 150px)
  useEffect(() => {
    if (timelineMessages.length > 0 && !isLoading) {
      const container = messagesContainerRef.current;
      const isNewMessage = timelineMessages.length > prevMessageCountRef.current;

      // Verificar si el usuario está cerca del final del scroll
      const isNearBottom = container
        ? (container.scrollHeight - container.scrollTop - container.clientHeight) < 150
        : true;

      // Solo hacer auto-scroll si es carga inicial o si hay nuevo mensaje y está cerca del final
      if (isInitialLoadRef.current || (isNewMessage && isNearBottom)) {
        messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoadRef.current ? 'auto' : 'smooth' });
        isInitialLoadRef.current = false;
      }

      prevMessageCountRef.current = timelineMessages.length;
    }
  }, [timelineMessages, isLoading]);

  // Reset cuando cambia el ticket
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessageCountRef.current = 0;
  }, [ticket.id]);

  // Solution action state
  const [isProcessingSolution, setIsProcessingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState<string | null>(null);
  const [solutionSuccess, setSolutionSuccess] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingSolutionId, setRejectingSolutionId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApproveSolution = async (solutionId: number) => {
    if (!sessionToken || isProcessingSolution) return;

    setIsProcessingSolution(true);
    setSolutionError(null);
    setSolutionSuccess(null);

    try {
      // Pass ticket.rawId to close the ticket after approval
      const success = await approveSolution(sessionToken, solutionId, loggedInUserId, ticket.rawId);
      if (success) {
        setSolutionSuccess('Solución aprobada y ticket cerrado exitosamente');
        onRefreshTimeline();
        setTimeout(() => setSolutionSuccess(null), 3000);
      } else {
        setSolutionError('Error al aprobar la solución');
      }
    } catch (error) {
      console.error('Error aprobando solución:', error);
      setSolutionError('Error al aprobar la solución');
    } finally {
      setIsProcessingSolution(false);
    }
  };

  const handleRejectSolution = (solutionId: number) => {
    setRejectingSolutionId(solutionId);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmRejectSolution = async () => {
    if (!sessionToken || !rejectingSolutionId || isProcessingSolution) return;

    setIsProcessingSolution(true);
    setSolutionError(null);
    setSolutionSuccess(null);

    try {
      const success = await rejectSolution(sessionToken, rejectingSolutionId, loggedInUserId, ticket.rawId);
      if (success) {
        // Siempre enviar un followup automático informando del rechazo
        const rejectionMessage = rejectionReason.trim()
          ? `El usuario ha rechazado la solución propuesta.\n\nMotivo: ${rejectionReason.trim()}`
          : 'El usuario ha rechazado la solución propuesta.';
        await sendFollowup(sessionToken, ticket.rawId, rejectionMessage, loggedInUserId);

        setSolutionSuccess('Solución rechazada. Puedes continuar escribiendo mensajes.');
        setShowRejectModal(false);
        setRejectingSolutionId(null);
        setRejectionReason('');
        onRefreshTimeline();
        setTimeout(() => setSolutionSuccess(null), 4000);
      } else {
        setSolutionError('Error al rechazar la solución');
      }
    } catch (error) {
      console.error('Error rechazando solución:', error);
      setSolutionError('Error al rechazar la solución');
    } finally {
      setIsProcessingSolution(false);
    }
  };

  const cancelRejectSolution = () => {
    setShowRejectModal(false);
    setRejectingSolutionId(null);
    setRejectionReason('');
  };

  return (
    <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 ${isExpanded ? 'p-0' : 'p-4'}`}>
      <div className={`bg-white shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 transition-all ${
        isExpanded
          ? 'w-full h-full rounded-none'
          : 'w-full max-w-2xl max-h-[90vh] rounded-2xl'
      }`}>
        {/* Header del Modal */}
        <div className={`flex-shrink-0 bg-blue-50 px-6 py-4 border-b border-blue-100 ${isExpanded ? '' : 'rounded-t-2xl'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={onClose}
                className="p-2 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0"
                title="Volver a la lista"
              >
                <ArrowLeft className="w-5 h-5 text-blue-600" />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900">
                  Ticket {ticket.id}
                </h3>
                <p className="text-sm text-slate-600 truncate" title={ticket.subject}>
                  {ticket.subject}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                title={isExpanded ? 'Reducir' : 'Expandir'}
              >
                {isExpanded ? (
                  <Minimize2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-blue-600" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Contenido del Modal */}
        <div className={`flex-1 p-6 space-y-5 flex flex-col ${isExpanded ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {/* Estado y Prioridad */}
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
              style={getStatusStyle(ticket.status)}
            >
              {getStatusIcon(ticket.status)}
              <span>{getStatusLabel(ticket.status)}</span>
            </span>
            <span
              className="inline-flex items-center px-3 py-1.5 rounded text-sm font-medium"
              style={getPriorityStyle(ticket.priority)}
            >
              {getPriorityLabel(ticket.priority)}
            </span>
          </div>

          {/* Información del Ticket */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">Fecha:</span>
              <span className="font-medium text-slate-900">{ticket.date || 'Sin fecha'}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">Categoría:</span>
              <span className="font-medium text-slate-900">{ticket.category}</span>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
              <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
              <span className="text-slate-600">Asignado a:</span>
              <span className="font-medium text-slate-900">
                {ticket.assignedTo}
                {ticket.group && (
                  <span className="text-slate-500 text-xs ml-1">({ticket.group})</span>
                )}
              </span>
            </div>
          </div>

          {/* Timeline de Conversación */}
          <div className={`flex flex-col min-h-0 ${isExpanded ? 'flex-1' : ''}`}>
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-slate-900">Conversación</h4>
            </div>
            <div ref={messagesContainerRef} className={`bg-slate-50 rounded-xl p-4 overflow-y-auto border border-slate-200 space-y-4 ${isExpanded ? 'flex-1 min-h-0' : 'max-h-72'}`}>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  <span className="ml-2 text-slate-600">Cargando conversación...</span>
                </div>
              ) : timelineMessages.length > 0 ? (
                timelineMessages.map((message) => (
                  <div
                    key={`${message.type}-${message.id}`}
                    className={`flex gap-3 ${isMyMessage(message) ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{
                        backgroundColor: isMyMessage(message) ? '#4CAF50' : '#78909C'
                      }}
                    >
                      {message.userInitials}
                    </div>

                    {/* Contenido del mensaje */}
                    <div
                      className={`flex-1 max-w-[85%] min-w-0 rounded-xl p-4 overflow-hidden ${isMyMessage(message) ? 'ml-auto' : ''}`}
                      style={{
                        backgroundColor: message.type === 'solution'
                          ? '#ECFDF5'
                          : message.type === 'document'
                          ? '#EFF6FF'
                          : isMyMessage(message)
                          ? '#DCF8C6'
                          : '#FFFFFF',
                        borderLeft: isMyMessage(message)
                          ? 'none'
                          : `4px solid ${message.type === 'solution' ? '#10B981' : message.type === 'document' ? '#3B82F6' : '#78909C'}`,
                        borderRight: isMyMessage(message) ? '4px solid #4CAF50' : 'none',
                        border: isMyMessage(message) ? 'none' : '1px solid #E0E0E0',
                        borderLeftWidth: isMyMessage(message) ? '1px' : '4px',
                      }}
                    >
                      {/* Header del mensaje */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900">
                            {message.userName}
                          </span>
                          {message.type === 'solution' ? (
                            <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Solución
                            </span>
                          ) : message.type === 'document' ? (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              Archivo
                            </span>
                          ) : isMyMessage(message) ? (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                              {message.type === 'initial' ? 'Solicitante' : 'Tú'}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                              {message.isAgent ? 'Agente' : 'Usuario'}
                            </span>
                          )}
                          {message.isPrivate && (
                            <span className="text-xs" title="Mensaje privado">&#128274;</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">{message.date}</span>
                      </div>

                      {/* Contenido - Documento independiente o Texto */}
                      {message.type === 'document' && message.document ? (
                        <div className="space-y-2">
                          {/* Preview de imagen si es imagen */}
                          {message.document.mime.startsWith('image/') && sessionToken && (
                            <img
                              src={`/api/glpi/document/${message.document.id}?session_token=${sessionToken}`}
                              alt={message.document.filename}
                              className="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer hover:opacity-90 border border-slate-200"
                              onClick={() => window.open(`/api/glpi/document/${message.document!.id}?session_token=${sessionToken}`, '_blank')}
                            />
                          )}

                          {/* Info del archivo */}
                          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-slate-200">
                            {message.document.mime.startsWith('image/') ? (
                              <Image size={20} className="text-blue-500 flex-shrink-0" />
                            ) : message.document.mime === 'application/pdf' ? (
                              <FileText size={20} className="text-red-500 flex-shrink-0" />
                            ) : (
                              <File size={20} className="text-gray-500 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{message.document.filename}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(message.document.filesize)}</p>
                            </div>
                            {sessionToken && (
                              <a
                                href={`/api/glpi/document/${message.document.id}?session_token=${sessionToken}&download=true`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                                title="Descargar"
                              >
                                <Download size={16} className="text-gray-600" />
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Contenido de texto del mensaje */}
                          <div
                            className="text-sm text-slate-700 prose prose-sm max-w-none break-words overflow-hidden"
                            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.content) }}
                          />

                          {/* Documentos adjuntos al mensaje (followup/solution) */}
                          {message.documents && message.documents.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                                <Paperclip className="w-3 h-3" />
                                <span>Archivos adjuntos ({message.documents.length})</span>
                              </div>
                              {message.documents.map((doc) => (
                                <div key={doc.id} className="space-y-2">
                                  {/* Preview de imagen si es imagen */}
                                  {doc.mime.startsWith('image/') && sessionToken && (
                                    <img
                                      src={`/api/glpi/document/${doc.id}?session_token=${sessionToken}`}
                                      alt={doc.filename}
                                      className="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer hover:opacity-90 border border-slate-200"
                                      onClick={() => window.open(`/api/glpi/document/${doc.id}?session_token=${sessionToken}`, '_blank')}
                                    />
                                  )}

                                  {/* Info del archivo */}
                                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-slate-200">
                                    {doc.mime.startsWith('image/') ? (
                                      <Image size={20} className="text-blue-500 flex-shrink-0" />
                                    ) : doc.mime === 'application/pdf' ? (
                                      <FileText size={20} className="text-red-500 flex-shrink-0" />
                                    ) : doc.mime.includes('zip') || doc.mime.includes('compressed') ? (
                                      <File size={20} className="text-amber-500 flex-shrink-0" />
                                    ) : (
                                      <File size={20} className="text-gray-500 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{doc.filename}</p>
                                    </div>
                                    {sessionToken && (
                                      <a
                                        href={`/api/glpi/document/${doc.id}?session_token=${sessionToken}&download=true`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                                        title="Descargar"
                                      >
                                        <Download size={16} className="text-gray-600" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Solution status indicator - No buttons here, they are at the bottom */}
                      {message.type === 'solution' && message.solution && (
                        <div className="mt-3">
                          {/* Solución pendiente - solo indicador, botones están abajo */}
                          {Number(message.solution.status) === 2 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-600" />
                              <span className="text-sm text-amber-700 font-medium">Pendiente de tu aprobación</span>
                            </div>
                          )}

                          {/* Solución aprobada */}
                          {Number(message.solution.status) === 3 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
                              <ThumbsUp className="w-4 h-4 text-emerald-600" />
                              <span className="text-sm text-emerald-700 font-medium">Solución aprobada</span>
                            </div>
                          )}

                          {/* Solución rechazada */}
                          {Number(message.solution.status) === 4 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                              <ThumbsDown className="w-4 h-4 text-red-600" />
                              <span className="text-sm text-red-700 font-medium">Solución rechazada</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic text-center py-4">Sin mensajes en este ticket</p>
              )}
              {/* Ancla para auto-scroll */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input de Comentario o Botones de Aprobación */}
          <div className="flex-shrink-0 space-y-2">
            {/* Mensajes de éxito/error */}
            {(commentSuccess || solutionSuccess) && (
              <div className="p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700">{commentSuccess || solutionSuccess}</span>
              </div>
            )}
            {(commentError || attachmentError || solutionError) && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-700">{commentError || attachmentError || solutionError}</span>
              </div>
            )}

            {/* Si hay solución pendiente: mostrar botones de aprobar/rechazar */}
            {hasPendingSolution && lastSolution?.solution ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-amber-800">
                    El agente ha propuesto una solución
                  </span>
                </div>
                <p className="text-sm text-amber-700 mb-4">
                  Por favor, indica si la solución propuesta resuelve tu problema.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApproveSolution(lastSolution.solution!.id)}
                    disabled={isProcessingSolution}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessingSolution ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ThumbsUp className="w-5 h-5" />
                    )}
                    Aprobar solución
                  </button>
                  <button
                    onClick={() => handleRejectSolution(lastSolution.solution!.id)}
                    disabled={isProcessingSolution}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessingSolution ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ThumbsDown className="w-5 h-5" />
                    )}
                    Rechazar solución
                  </button>
                </div>
              </div>
            ) : ticket.status === 'cerrado' ? (
              /* Ticket cerrado - mostrar solo mensaje informativo, sin input */
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-600" />
                  <span className="font-medium text-emerald-800">
                    Este ticket ha sido cerrado
                  </span>
                </div>
                <p className="text-sm text-emerald-700 mt-2">
                  La solución fue aprobada y el ticket está cerrado. Si necesitas ayuda adicional, puedes crear un nuevo ticket.
                </p>
              </div>
            ) : (
              <>
                {/* Preview de archivos adjuntos */}
                {hasAttachments && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative group bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2"
                        >
                          {attachment.preview ? (
                            <img
                              src={attachment.preview}
                              alt=""
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <FileText className="w-6 h-6 text-slate-400" />
                          )}
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-700 max-w-[100px] truncate">
                              {attachment.file.name}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatFileSize(attachment.file.size)}
                            </span>
                          </div>
                          {attachment.status === 'uploading' && (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          )}
                          {attachment.status === 'uploaded' && (
                            <Check className="w-4 h-4 text-green-500" />
                          )}
                          {attachment.status === 'error' && (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                          <button
                            onClick={() => onRemoveAttachment(attachment.id)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Eliminar archivo"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input oculto para archivos */}
                <input
                  id="comment-attachments"
                  name="attachments"
                  ref={attachmentFileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={onFileSelect}
                  className="hidden"
                />

                {/* Input + Botones en línea */}
                <div className="flex items-center gap-2 rounded-full p-1.5 border bg-slate-100 border-slate-200">
                  {/* Botón de adjuntar */}
                  <button
                    onClick={() => attachmentFileInputRef.current?.click()}
                    className="flex-shrink-0 w-10 h-10 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full flex items-center justify-center transition-colors disabled:hover:text-slate-500 disabled:hover:bg-transparent"
                    title="Adjuntar archivo"
                    disabled={isSendingComment}
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <input
                    id="ticket-comment"
                    name="comment"
                    ref={commentTextareaRef}
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !isSendingComment && onSendComment()}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none disabled:cursor-not-allowed"
                    disabled={isSendingComment}
                    spellCheck={true}
                    lang="es"
                    autoComplete="off"
                    autoCorrect="on"
                  />
                  <button
                    onClick={onSendComment}
                    disabled={(!newComment.trim() && !hasAttachments) || isSendingComment}
                    className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Enviar mensaje"
                  >
                    {isSendingComment ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de rechazo de solución */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <ThumbsDown className="w-5 h-5 text-red-600" />
                Rechazar solución
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                ¿Estás seguro que deseas rechazar esta solución? Opcionalmente puedes indicar el motivo del rechazo.
              </p>
              <div>
                <label htmlFor="rejection-reason" className="block text-sm font-medium text-slate-700 mb-1">
                  Motivo del rechazo (opcional)
                </label>
                <textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explica por qué rechazas esta solución..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  spellCheck={true}
                  lang="es"
                  autoCorrect="on"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={cancelRejectSolution}
                disabled={isProcessingSolution}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRejectSolution}
                disabled={isProcessingSolution}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessingSolution ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ThumbsDown className="w-4 h-4" />
                )}
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
