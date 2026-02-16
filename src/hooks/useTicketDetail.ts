// src/hooks/useTicketDetail.ts
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Ticket, TimelineMessage, TimelineDocument, UserNameData, CommentAttachment } from '@/types';
import { getTicketDetail, getFollowups, getSolutions, sendFollowup, uploadDocument, getTicketDocuments } from '@/services/glpiApi';
import { decodeHtmlEntities, formatGlpiDate, getInitials } from '@/utils';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 4;

interface UseTicketDetailReturn {
  selectedTicket: Ticket | null;
  showTicketDetail: boolean;
  isLoadingDetail: boolean;
  timelineMessages: TimelineMessage[];
  newComment: string;
  setNewComment: (comment: string) => void;
  isSendingComment: boolean;
  commentSuccess: string | null;
  commentError: string | null;
  isDetailExpanded: boolean;
  setIsDetailExpanded: (expanded: boolean) => void;
  handleViewTicketDetail: (ticket: Ticket) => Promise<void>;
  refreshTimelineSilently: () => Promise<void>;
  handleCloseTicketDetail: () => void;
  handleSendComment: () => Promise<void>;
  commentTextareaRef: React.RefObject<HTMLInputElement>;
  // Attachment props
  attachments: CommentAttachment[];
  attachmentFileInputRef: React.RefObject<HTMLInputElement>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeAttachment: (id: string) => void;
  hasAttachments: boolean;
  attachmentError: string | null;
  // Session token for document downloads
  sessionToken: string | null;
}

export function useTicketDetail(
  glpiSessionToken: string | null,
  fetchUserName: (userId: number) => Promise<UserNameData>,
  getAgentIds: (ticketId: number) => Promise<number[]>,
  loggedInUserId?: number,
  loggedInUserName?: string
): UseTicketDetailReturn {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showTicketDetail, setShowTicketDetail] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [timelineMessages, setTimelineMessages] = useState<TimelineMessage[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const commentTextareaRef = useRef<HTMLInputElement>(null);

  // Attachment state
  const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);


  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setAttachmentError(null);

    // Verificar límite de archivos
    const remainingSlots = MAX_FILES - attachments.length;
    if (remainingSlots <= 0) {
      setAttachmentError(`Máximo ${MAX_FILES} archivos permitidos`);
      e.target.value = '';
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    const validFiles: CommentAttachment[] = [];

    for (const file of filesToAdd) {
      // Validar tipo
      if (!ALLOWED_TYPES.includes(file.type)) {
        setAttachmentError(`Tipo de archivo no permitido: ${file.name}`);
        continue;
      }

      // Validar tamaño
      if (file.size > MAX_FILE_SIZE) {
        setAttachmentError(`Archivo muy grande (máx 10MB): ${file.name}`);
        continue;
      }

      validFiles.push({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        status: 'pending',
      });
    }

    if (validFiles.length > 0) {
      setAttachments((prev) => [...prev, ...validFiles]);
    }

    e.target.value = ''; // Reset input
  }, [attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const updateAttachmentStatus = useCallback((id: string, status: CommentAttachment['status']) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setAttachments([]);
    setAttachmentError(null);
  }, [attachments]);

  const handleViewTicketDetail = useCallback(async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowTicketDetail(true);
    setIsLoadingDetail(true);
    setTimelineMessages([]);
    setNewComment('');
    setCommentSuccess(null);
    setCommentError(null);
    clearAttachments();

    try {
      if (!glpiSessionToken) {
        setCommentError('No hay sesión activa');
        setIsLoadingDetail(false);
        return;
      }

      // Cargar ticket, followups, soluciones, documentos y agentes en paralelo
      const [ticketResponse, followupsResponse, solutionsResponse, documentsResponse, agentIds] = await Promise.all([
        getTicketDetail(glpiSessionToken, ticket.rawId),
        getFollowups(glpiSessionToken, ticket.rawId),
        getSolutions(glpiSessionToken, ticket.rawId),
        getTicketDocuments(glpiSessionToken, ticket.rawId),
        getAgentIds(ticket.rawId)
      ]);

      // Función helper para verificar si un userId es agente
      const isAgent = (userId: number): boolean => agentIds.includes(userId);

      const messages: TimelineMessage[] = [];

      // Procesar mensaje inicial (descripción del ticket)
      if (ticketResponse.success && ticketResponse.ticket) {
        const ticketInfo = ticketResponse.ticket as {
          content?: string;
          users_id_recipient?: number;
          users_id_lastupdater?: number;
          date?: string;
          date_creation?: string;
          status?: number;
        };
        const content = ticketInfo.content || '';

        // Actualizar el status del ticket si cambió (ej: después de aprobar solución)
        if (ticketInfo.status !== undefined) {
          const statusMap: Record<number, string> = {
            1: 'nuevo',
            2: 'en-progreso',
            3: 'en-progreso',
            4: 'pendiente',
            5: 'resuelto',
            6: 'cerrado',
          };
          const newStatus = statusMap[ticketInfo.status] || ticket.status;
          if (newStatus !== ticket.status || ticketInfo.status !== ticket.statusCode) {
            setSelectedTicket({
              ...ticket,
              status: newStatus,
              statusCode: ticketInfo.status,
            });
          }
        }

        // Obtener nombre del solicitante
        const requesterId = ticketInfo.users_id_recipient || ticketInfo.users_id_lastupdater || 0;
        const requesterData = requesterId ? await fetchUserName(requesterId) : { firstname: '', realname: 'Solicitante' };
        const requesterName = `${requesterData.firstname} ${requesterData.realname}`.trim() || 'Solicitante';

        const initialRawDate = ticketInfo.date || ticketInfo.date_creation || '';
        messages.push({
          id: 0,
          type: 'initial',
          date: formatGlpiDate(initialRawDate),
          rawDate: initialRawDate,
          userId: requesterId,
          userName: requesterName,
          userInitials: getInitials(requesterData.firstname, requesterData.realname),
          content: decodeHtmlEntities(content as string, glpiSessionToken),
          isPrivate: false,
          isAgent: false,
        });
      }

      // Crear mapa de documentos por followup ID y solution ID
      const followupDocuments = new Map<number, TimelineDocument[]>();
      const solutionDocuments = new Map<number, TimelineDocument[]>();
      const ticketDocuments: typeof documentsResponse = [];

      if (Array.isArray(documentsResponse) && documentsResponse.length > 0) {
        for (const doc of documentsResponse) {
          const timelineDoc: TimelineDocument = {
            id: doc.id,
            name: doc.name,
            filename: doc.filename,
            mime: doc.mime || 'application/octet-stream',
            filesize: doc.filesize || 0,
          };

          // Clasificar documentos según su itemtype
          if (doc.itemtype === 'ITILFollowup' && doc.items_id) {
            const existing = followupDocuments.get(doc.items_id) || [];
            existing.push(timelineDoc);
            followupDocuments.set(doc.items_id, existing);
          } else if (doc.itemtype === 'ITILSolution' && doc.items_id) {
            const existing = solutionDocuments.get(doc.items_id) || [];
            existing.push(timelineDoc);
            solutionDocuments.set(doc.items_id, existing);
          } else {
            // Documentos asociados al ticket directamente
            ticketDocuments.push(doc);
          }
        }
      }

      // Procesar followups
      if (followupsResponse.success && Array.isArray(followupsResponse.followups)) {
        console.log(`[Timeline] Cargados ${followupsResponse.followups.length} followups`);

        for (const followup of followupsResponse.followups) {
          const fu = followup as { id: number; users_id?: number; date?: string; content?: string; is_private?: number };

          // Ocultar followups privados al usuario
          if (fu.is_private === 1) continue;

          const userId = fu.users_id || 0;
          const userData = userId ? await fetchUserName(userId) : { firstname: '', realname: 'Agente' };
          const fuUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Agente';
          const fuRawDate = fu.date || '';

          // Obtener documentos asociados a este followup
          const attachedDocs = followupDocuments.get(fu.id);

          messages.push({
            id: fu.id,
            type: 'followup',
            date: formatGlpiDate(fuRawDate),
            rawDate: fuRawDate,
            userId: userId,
            userName: fuUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: decodeHtmlEntities(fu.content || '', glpiSessionToken),
            isPrivate: false,
            isAgent: isAgent(userId),
            documents: attachedDocs,  // Array de documentos adjuntos al followup
          });
        }
      }

      // Procesar soluciones
      if (solutionsResponse.success && Array.isArray(solutionsResponse.solutions)) {
        for (const solution of solutionsResponse.solutions) {
          const sol = solution as { id: number; users_id?: number; date_creation?: string; date?: string; content?: string; status?: number };
          const userId = sol.users_id || 0;
          const userData = userId ? await fetchUserName(userId) : { firstname: '', realname: 'Agente' };
          const solUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Agente';
          const solRawDate = sol.date_creation || sol.date || '';

          // Obtener documentos asociados a esta solución
          const attachedDocs = solutionDocuments.get(sol.id);

          messages.push({
            id: sol.id,
            type: 'solution',
            date: formatGlpiDate(solRawDate),
            rawDate: solRawDate,
            userId: userId,
            userName: solUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: decodeHtmlEntities(sol.content || '', glpiSessionToken),
            isPrivate: false,
            isAgent: true,
            solution: {
              id: sol.id,
              status: Number(sol.status) || 2, // 2=pendiente por defecto
            },
            documents: attachedDocs,  // Array de documentos adjuntos a la solución
          });
        }
      }

      // Procesar documentos que no están asociados a followups/solutions (asociados directamente al ticket)
      if (ticketDocuments.length > 0) {
        for (const doc of ticketDocuments) {
          const userId = doc.users_id || 0;
          const userData = userId ? await fetchUserName(userId) : { firstname: '', realname: 'Usuario' };
          const docUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Usuario';
          const docRawDate = doc.date_creation || '';

          messages.push({
            id: `doc-${doc.id}`,
            type: 'document',
            date: formatGlpiDate(docRawDate),
            rawDate: docRawDate,
            userId: userId,
            userName: docUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: doc.filename,
            isPrivate: false,
            isAgent: isAgent(userId),
            document: {
              id: doc.id,
              name: doc.name,
              filename: doc.filename,
              mime: doc.mime || 'application/octet-stream',
              filesize: doc.filesize || 0,
            },
          });
        }
      }

      // Ordenar por fecha usando rawDate (formato ISO de GLPI)
      messages.sort((a, b) => {
        const dateA = new Date(a.rawDate).getTime() || 0;
        const dateB = new Date(b.rawDate).getTime() || 0;
        return dateA - dateB;
      });

      console.log(`[Timeline] Total ${messages.length} mensajes a mostrar (initial: ${messages.filter(m => m.type === 'initial').length}, followups: ${messages.filter(m => m.type === 'followup').length}, solutions: ${messages.filter(m => m.type === 'solution').length}, documents: ${messages.filter(m => m.type === 'document').length})`);
      setTimelineMessages(messages);

      // Enfocar el textarea de comentarios después de cargar
      setTimeout(() => {
        commentTextareaRef.current?.focus();
      }, 100);

    } catch (error) {
      console.error('Error cargando detalle del ticket:', error);
      setCommentError('Error al cargar el detalle del ticket');
    } finally {
      setIsLoadingDetail(false);
    }
  }, [glpiSessionToken, fetchUserName, getAgentIds, clearAttachments]);

  // Ref para handleViewTicketDetail (usado en handleSendComment sin causar dependencias circulares)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleViewTicketDetailRef = useRef<((ticket: Ticket) => Promise<void>) | null>(null);
  useEffect(() => {
    handleViewTicketDetailRef.current = handleViewTicketDetail;
  }, [handleViewTicketDetail]);

  // Función para refrescar el timeline sin mostrar spinner de carga (usada después de enviar un comentario)
  const refreshTimelineSilently = useCallback(async () => {
    if (!selectedTicket || !glpiSessionToken) return;

    try {
      // Cargar ticket, followups, soluciones, documentos y agentes en paralelo
      const [ticketResponse, followupsResponse, solutionsResponse, documentsResponse, agentIds] = await Promise.all([
        getTicketDetail(glpiSessionToken, selectedTicket.rawId),
        getFollowups(glpiSessionToken, selectedTicket.rawId),
        getSolutions(glpiSessionToken, selectedTicket.rawId),
        getTicketDocuments(glpiSessionToken, selectedTicket.rawId),
        getAgentIds(selectedTicket.rawId)
      ]);

      // Función helper para verificar si un userId es agente
      const isAgentCheck = (userId: number): boolean => agentIds.includes(userId);

      const messages: TimelineMessage[] = [];

      // Procesar mensaje inicial (descripción del ticket)
      if (ticketResponse.success && ticketResponse.ticket) {
        const ticketInfo = ticketResponse.ticket as {
          content?: string;
          users_id_recipient?: number;
          users_id_lastupdater?: number;
          date?: string;
          date_creation?: string;
          status?: number;
        };
        const content = ticketInfo.content || '';

        // Actualizar el status del ticket si cambió
        if (ticketInfo.status !== undefined) {
          const statusMap: Record<number, string> = {
            1: 'nuevo',
            2: 'en-progreso',
            3: 'en-progreso',
            4: 'pendiente',
            5: 'resuelto',
            6: 'cerrado',
          };
          const newStatus = statusMap[ticketInfo.status] || selectedTicket.status;
          if (newStatus !== selectedTicket.status || ticketInfo.status !== selectedTicket.statusCode) {
            setSelectedTicket({
              ...selectedTicket,
              status: newStatus,
              statusCode: ticketInfo.status,
            });
          }
        }

        // Obtener nombre del solicitante
        const requesterId = ticketInfo.users_id_recipient || ticketInfo.users_id_lastupdater || 0;
        const requesterData = requesterId ? await fetchUserName(requesterId) : { firstname: '', realname: 'Solicitante' };
        const requesterName = `${requesterData.firstname} ${requesterData.realname}`.trim() || 'Solicitante';

        const initialRawDate = ticketInfo.date || ticketInfo.date_creation || '';
        messages.push({
          id: 0,
          type: 'initial',
          date: formatGlpiDate(initialRawDate),
          rawDate: initialRawDate,
          userId: requesterId,
          userName: requesterName,
          userInitials: getInitials(requesterData.firstname, requesterData.realname),
          content: decodeHtmlEntities(content as string, glpiSessionToken),
          isPrivate: false,
          isAgent: false,
        });
      }

      // Crear mapa de documentos por followup ID y solution ID
      const followupDocuments = new Map<number, TimelineDocument[]>();
      const solutionDocuments = new Map<number, TimelineDocument[]>();
      const ticketDocuments: typeof documentsResponse = [];

      if (Array.isArray(documentsResponse) && documentsResponse.length > 0) {
        for (const doc of documentsResponse) {
          const timelineDoc: TimelineDocument = {
            id: doc.id,
            name: doc.name,
            filename: doc.filename,
            mime: doc.mime || 'application/octet-stream',
            filesize: doc.filesize || 0,
          };

          if (doc.itemtype === 'ITILFollowup' && doc.items_id) {
            const existing = followupDocuments.get(doc.items_id) || [];
            existing.push(timelineDoc);
            followupDocuments.set(doc.items_id, existing);
          } else if (doc.itemtype === 'ITILSolution' && doc.items_id) {
            const existing = solutionDocuments.get(doc.items_id) || [];
            existing.push(timelineDoc);
            solutionDocuments.set(doc.items_id, existing);
          } else {
            ticketDocuments.push(doc);
          }
        }
      }

      // Procesar followups
      if (followupsResponse.success && Array.isArray(followupsResponse.followups)) {
        for (const followup of followupsResponse.followups) {
          const fu = followup as { id: number; users_id?: number; date?: string; content?: string; is_private?: number };

          // Ocultar followups privados al usuario
          if (fu.is_private === 1) continue;

          const userId = fu.users_id || 0;
          const userData = userId ? await fetchUserName(userId) : { firstname: '', realname: 'Agente' };
          const fuUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Agente';
          const fuRawDate = fu.date || '';
          const attachedDocs = followupDocuments.get(fu.id);

          messages.push({
            id: fu.id,
            type: 'followup',
            date: formatGlpiDate(fuRawDate),
            rawDate: fuRawDate,
            userId: userId,
            userName: fuUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: decodeHtmlEntities(fu.content || '', glpiSessionToken),
            isPrivate: false,
            isAgent: isAgentCheck(userId),
            documents: attachedDocs,
          });
        }
      }

      // Procesar soluciones
      if (solutionsResponse.success && Array.isArray(solutionsResponse.solutions)) {
        for (const solution of solutionsResponse.solutions) {
          const sol = solution as { id: number; users_id?: number; date_creation?: string; date?: string; content?: string; status?: number };
          const userId = sol.users_id || 0;
          const userData = userId ? await fetchUserName(userId) : { firstname: '', realname: 'Agente' };
          const solUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Agente';
          const solRawDate = sol.date_creation || sol.date || '';
          const attachedDocs = solutionDocuments.get(sol.id);

          messages.push({
            id: sol.id,
            type: 'solution',
            date: formatGlpiDate(solRawDate),
            rawDate: solRawDate,
            userId: userId,
            userName: solUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: decodeHtmlEntities(sol.content || '', glpiSessionToken),
            isPrivate: false,
            isAgent: true,
            solution: {
              id: sol.id,
              status: Number(sol.status) || 2,
            },
            documents: attachedDocs,
          });
        }
      }

      // Procesar documentos del ticket
      if (ticketDocuments.length > 0) {
        for (const doc of ticketDocuments) {
          const userId = doc.users_id || 0;
          const userData = userId ? await fetchUserName(userId) : { firstname: '', realname: 'Usuario' };
          const docUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Usuario';
          const docRawDate = doc.date_creation || '';

          messages.push({
            id: `doc-${doc.id}`,
            type: 'document',
            date: formatGlpiDate(docRawDate),
            rawDate: docRawDate,
            userId: userId,
            userName: docUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: doc.filename,
            isPrivate: false,
            isAgent: isAgentCheck(userId),
            document: {
              id: doc.id,
              name: doc.name,
              filename: doc.filename,
              mime: doc.mime || 'application/octet-stream',
              filesize: doc.filesize || 0,
            },
          });
        }
      }

      // Ordenar por fecha
      messages.sort((a, b) => {
        const dateA = new Date(a.rawDate).getTime() || 0;
        const dateB = new Date(b.rawDate).getTime() || 0;
        return dateA - dateB;
      });

      setTimelineMessages(messages);

    } catch (error) {
      console.error('Error refrescando timeline:', error);
    }
  }, [selectedTicket, glpiSessionToken, fetchUserName, getAgentIds]);

  // Ref para refreshTimelineSilently (usado en handleSendComment sin dependencias circulares)
  const refreshTimelineSilentlyRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    refreshTimelineSilentlyRef.current = refreshTimelineSilently;
  }, [refreshTimelineSilently]);

  const handleCloseTicketDetail = useCallback(() => {
    setShowTicketDetail(false);
    setSelectedTicket(null);
    setTimelineMessages([]);
    setNewComment('');
    setCommentSuccess(null);
    setCommentError(null);
    setIsDetailExpanded(false);
    clearAttachments();
  }, [clearAttachments]);

  const handleSendComment = useCallback(async () => {
    const hasText = newComment.trim().length > 0;
    const hasFiles = attachments.length > 0;

    if (!hasText && !hasFiles) return;
    if (!selectedTicket || !glpiSessionToken) return;

    setIsSendingComment(true);
    setCommentError(null);
    setCommentSuccess(null);
    setAttachmentError(null);

    try {
      let uploadErrors = 0;

      // Subir archivos primero
      for (const attachment of attachments) {
        updateAttachmentStatus(attachment.id, 'uploading');
        const result = await uploadDocument(glpiSessionToken, attachment.file, selectedTicket.rawId, loggedInUserId);
        if (result.success) {
          updateAttachmentStatus(attachment.id, 'uploaded');
        } else {
          updateAttachmentStatus(attachment.id, 'error');
          uploadErrors++;
        }
      }

      // Enviar comentario de texto si hay
      if (hasText) {
        const result = await sendFollowup(glpiSessionToken, selectedTicket.rawId, newComment.trim(), loggedInUserId);

        if (!result.success) {
          setCommentError(result.error || 'Error al enviar el comentario');
          setIsSendingComment(false);
          return;
        }
      }

      // Mostrar mensaje de éxito
      if (uploadErrors === 0) {
        const successMsg = hasFiles && hasText
          ? 'Mensaje y archivos enviados exitosamente'
          : hasFiles
          ? 'Archivos subidos exitosamente'
          : 'Comentario enviado exitosamente';
        setCommentSuccess(successMsg);
      } else {
        setAttachmentError(`${uploadErrors} archivo(s) no se pudieron subir`);
      }

      // Limpiar campos después de enviar exitosamente
      setNewComment('');
      clearAttachments();

      // Refrescar el timeline silenciosamente (sin spinner de carga)
      // para obtener el estado actualizado del ticket (incluyendo si fue reabierto)
      // Pequeño delay para dar tiempo a GLPI de procesar
      setTimeout(async () => {
        if (refreshTimelineSilentlyRef.current) {
          await refreshTimelineSilentlyRef.current();
        }
      }, 500);

      setTimeout(() => setCommentSuccess(null), 3000);

    } catch (error) {
      console.error('Error enviando comentario:', error);
      setCommentError('Error al enviar el comentario');
    } finally {
      setIsSendingComment(false);
    }
  }, [newComment, attachments, selectedTicket, glpiSessionToken, loggedInUserId, loggedInUserName, updateAttachmentStatus, clearAttachments]);

  // Polling para detectar cambios en el ticket (estado, followups, soluciones)
  useEffect(() => {
    // Solo hacer polling si el modal está abierto, hay un ticket seleccionado y tenemos token
    if (!showTicketDetail || !selectedTicket?.rawId || !glpiSessionToken) {
      return;
    }

    const ticketId = selectedTicket.rawId;
    const POLLING_INTERVAL = 10000; // 10 segundos

    console.log(`[Polling] Iniciando polling completo para ticket ${ticketId}`);

    // Usar refreshTimelineSilently que ya actualiza todo: estado, followups y soluciones
    const checkForUpdates = async () => {
      console.log(`[Polling] Verificando actualizaciones para ticket ${ticketId}...`);
      if (refreshTimelineSilentlyRef.current) {
        await refreshTimelineSilentlyRef.current();
      }
    };

    // Ejecutar la primera verificación después de un pequeño delay
    const initialTimeoutId = setTimeout(() => {
      console.log(`[Polling] Primera verificación inicial para ticket ${ticketId}`);
      checkForUpdates();
    }, 3000);

    const intervalId = setInterval(checkForUpdates, POLLING_INTERVAL);

    // Cleanup
    return () => {
      console.log(`[Polling] Deteniendo polling para ticket ${ticketId}`);
      clearTimeout(initialTimeoutId);
      clearInterval(intervalId);
    };
  }, [showTicketDetail, selectedTicket?.rawId, glpiSessionToken]);

  return {
    selectedTicket,
    showTicketDetail,
    isLoadingDetail,
    timelineMessages,
    newComment,
    setNewComment,
    isSendingComment,
    commentSuccess,
    commentError,
    isDetailExpanded,
    setIsDetailExpanded,
    handleViewTicketDetail,
    refreshTimelineSilently,
    handleCloseTicketDetail,
    handleSendComment,
    commentTextareaRef,
    // Attachment returns
    attachments,
    attachmentFileInputRef,
    handleFileSelect,
    removeAttachment,
    hasAttachments: attachments.length > 0,
    attachmentError,
    // Session token for document downloads
    sessionToken: glpiSessionToken,
  };
}
