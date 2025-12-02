// src/app/detalleticket/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import type { Ticket, GlpiUser, UserNameData, TimelineMessage, CommentAttachment } from '@/types';
import { TicketDetailModal } from '@/components/modals';
import {
  validateEmail, initSession, getGlpiUser, getTicketDetail, getUser,
  getTicketUsers, getTicketGroups, getGroupUsers, getFollowups, getSolutions, getTicketDocuments
} from '@/services/glpiApi';
import { decodeHtmlEntities, formatGlpiDate, getInitials } from '@/utils';

// Mapeo de estados de GLPI
const STATUS_MAP: Record<number, string> = {
  1: 'nuevo',
  2: 'en-progreso',
  3: 'en-progreso',
  4: 'pendiente',
  5: 'resuelto',
  6: 'cerrado',
};

// Mapeo de prioridades de GLPI
const PRIORITY_MAP: Record<number, string> = {
  1: 'muy-baja',
  2: 'baja',
  3: 'media',
  4: 'alta',
  5: 'muy-alta',
  6: 'mayor',
};

// Formatear fecha de GLPI a formato legible
function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function DetalleTicketContent() {
  const searchParams = useSearchParams();
  const mail = searchParams.get('mail');
  const idticket = searchParams.get('idticket');

  // Ref para evitar ejecución múltiple
  const hasInitialized = useRef(false);

  // Estados
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [glpiSessionToken, setGlpiSessionToken] = useState<string | null>(null);
  const [glpiUser, setGlpiUser] = useState<GlpiUser | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);

  // Estados para el TicketDetailModal
  const [timelineMessages, setTimelineMessages] = useState<TimelineMessage[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const commentTextareaRef = useRef<HTMLInputElement>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);

  // Refs para los caches (para evitar dependencias en useCallback)
  const userNamesCacheRef = useRef<Record<number, UserNameData>>({});
  const agentIdsCacheRef = useRef<Record<number, number[]>>({});
  const sessionTokenRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tiempo de inactividad en milisegundos (2 minutos)
  const INACTIVITY_TIMEOUT = 2 * 60 * 1000;

  // Actualizar ref cuando cambie el token
  useEffect(() => {
    sessionTokenRef.current = glpiSessionToken;
  }, [glpiSessionToken]);

  // Efecto para detectar inactividad y redirigir
  useEffect(() => {
    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        console.log('Sesión cerrada por inactividad');
        window.location.href = '/';
      }, INACTIVITY_TIMEOUT);
    };

    // Eventos que detectan actividad del usuario
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    // Iniciar el timer
    resetInactivityTimer();

    // Agregar listeners para resetear el timer en cada actividad
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer);
    });

    // Cleanup
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      activityEvents.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [INACTIVITY_TIMEOUT]);

  // Función para obtener nombre de usuario (usa ref para cache)
  const fetchUserName = useCallback(async (sessionToken: string, userId: number): Promise<UserNameData> => {
    if (userNamesCacheRef.current[userId]) {
      return userNamesCacheRef.current[userId];
    }
    const userData = await getUser(sessionToken, userId);
    userNamesCacheRef.current[userId] = userData;
    return userData;
  }, []);

  // Función para obtener IDs de agentes del ticket (usa ref para cache)
  const getAgentIdsForTicket = useCallback(async (sessionToken: string, ticketId: number): Promise<number[]> => {
    if (agentIdsCacheRef.current[ticketId]) {
      return agentIdsCacheRef.current[ticketId];
    }

    const agentIds: number[] = [];

    // 1. Obtener técnicos directos del ticket
    const ticketUsers = await getTicketUsers(sessionToken, ticketId);
    const directTechs = ticketUsers
      .filter(u => u.type === 2)
      .map(u => u.users_id);
    agentIds.push(...directTechs);

    // 2. Obtener grupos técnicos del ticket
    const groupTickets = await getTicketGroups(sessionToken, ticketId);
    const techGroupIds = groupTickets
      .filter(g => g.type === 2)
      .map(g => g.groups_id);

    // 3. Obtener miembros de cada grupo técnico
    for (const groupId of techGroupIds) {
      const groupUsers = await getGroupUsers(sessionToken, groupId);
      const groupTechs = groupUsers.map(m => m.users_id);
      agentIds.push(...groupTechs);
    }

    const uniqueAgentIds = [...new Set(agentIds)];
    agentIdsCacheRef.current[ticketId] = uniqueAgentIds;
    return uniqueAgentIds;
  }, []);

  // Cargar timeline del ticket
  const loadTicketTimeline = useCallback(async (sessionToken: string, ticketData: Ticket) => {
    setIsLoadingDetail(true);
    setTimelineMessages([]);

    try {
      // Cargar datos en paralelo
      const [ticketResponse, followupsResponse, solutionsResponse, documentsResponse, agentIds] = await Promise.all([
        getTicketDetail(sessionToken, ticketData.rawId),
        getFollowups(sessionToken, ticketData.rawId),
        getSolutions(sessionToken, ticketData.rawId),
        getTicketDocuments(sessionToken, ticketData.rawId),
        getAgentIdsForTicket(sessionToken, ticketData.rawId)
      ]);

      const isAgent = (userId: number): boolean => agentIds.includes(userId);
      const messages: TimelineMessage[] = [];

      // Procesar mensaje inicial
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

        if (ticketInfo.status !== undefined) {
          const statusMap: Record<number, string> = {
            1: 'nuevo', 2: 'en-progreso', 3: 'en-progreso',
            4: 'pendiente', 5: 'resuelto', 6: 'cerrado',
          };
          const newStatus = statusMap[ticketInfo.status] || ticketData.status;
          if (newStatus !== ticketData.status || ticketInfo.status !== ticketData.statusCode) {
            setTicket({
              ...ticketData,
              status: newStatus,
              statusCode: ticketInfo.status,
            });
          }
        }

        const requesterId = ticketInfo.users_id_recipient || ticketInfo.users_id_lastupdater || 0;
        const requesterData = requesterId ? await fetchUserName(sessionToken, requesterId) : { firstname: '', realname: 'Solicitante' };
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
          content: decodeHtmlEntities(content as string, sessionToken),
          isPrivate: false,
          isAgent: false,
        });
      }

      // Procesar followups
      if (followupsResponse.success && Array.isArray(followupsResponse.followups)) {
        for (const followup of followupsResponse.followups) {
          const fu = followup as { id: number; users_id?: number; date?: string; content?: string; is_private?: number };
          const userId = fu.users_id || 0;
          const userData = userId ? await fetchUserName(sessionToken, userId) : { firstname: '', realname: 'Agente' };
          const fuUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Agente';
          const fuRawDate = fu.date || '';

          messages.push({
            id: fu.id,
            type: 'followup',
            date: formatGlpiDate(fuRawDate),
            rawDate: fuRawDate,
            userId: userId,
            userName: fuUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: decodeHtmlEntities(fu.content || '', sessionToken),
            isPrivate: fu.is_private === 1,
            isAgent: isAgent(userId),
          });
        }
      }

      // Procesar soluciones
      if (solutionsResponse.success && Array.isArray(solutionsResponse.solutions)) {
        for (const solution of solutionsResponse.solutions) {
          const sol = solution as { id: number; users_id?: number; date_creation?: string; date?: string; content?: string; status?: number };
          const userId = sol.users_id || 0;
          const userData = userId ? await fetchUserName(sessionToken, userId) : { firstname: '', realname: 'Agente' };
          const solUserName = `${userData.firstname} ${userData.realname}`.trim() || 'Agente';
          const solRawDate = sol.date_creation || sol.date || '';

          messages.push({
            id: sol.id,
            type: 'solution',
            date: formatGlpiDate(solRawDate),
            rawDate: solRawDate,
            userId: userId,
            userName: solUserName,
            userInitials: getInitials(userData.firstname, userData.realname),
            content: decodeHtmlEntities(sol.content || '', sessionToken),
            isPrivate: false,
            isAgent: true,
            solution: {
              id: sol.id,
              status: Number(sol.status) || 2,
            },
          });
        }
      }

      // Procesar documentos
      if (Array.isArray(documentsResponse) && documentsResponse.length > 0) {
        for (const doc of documentsResponse) {
          const userId = doc.users_id || 0;
          const userData = userId ? await fetchUserName(sessionToken, userId) : { firstname: '', realname: 'Usuario' };
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

      // Ordenar por fecha
      messages.sort((a, b) => {
        const dateA = new Date(a.rawDate).getTime() || 0;
        const dateB = new Date(b.rawDate).getTime() || 0;
        return dateA - dateB;
      });

      setTimelineMessages(messages);

    } catch (error) {
      console.error('Error cargando timeline del ticket:', error);
      setCommentError('Error al cargar el detalle del ticket');
    } finally {
      setIsLoadingDetail(false);
    }
  }, [fetchUserName, getAgentIdsForTicket]);

  // Función para cargar ticket por ID y validar propiedad
  const loadTicketById = useCallback(async (sessionToken: string, ticketId: number, userId: number) => {
    setIsLoadingTicket(true);
    try {
      const response = await getTicketDetail(sessionToken, ticketId);

      if (!response.success || !response.ticket) {
        setValidationError('No se pudo encontrar el ticket solicitado');
        return null;
      }

      const ticketData = response.ticket as {
        id: number;
        name?: string;
        status?: number;
        priority?: number;
        date?: string;
        date_creation?: string;
        itilcategories_id?: number;
        users_id_recipient?: number;
        _users_id_assign?: { name?: string }[];
        _groups_id_assign?: { name?: string }[];
      };

      // Validar que el ticket pertenece al usuario (users_id_recipient es el solicitante)
      if (ticketData.users_id_recipient !== userId) {
        console.error(`Acceso denegado: Ticket ${ticketId} pertenece a usuario ${ticketData.users_id_recipient}, no a ${userId}`);
        setValidationError('No tienes permiso para ver este ticket');
        return null;
      }

      // Validar que el ticket no esté cerrado (status 6 = cerrado)
      if (ticketData.status === 6) {
        console.log(`Ticket ${ticketId} está cerrado`);
        setValidationError('Este ticket ya está cerrado y no puede ser consultado');
        return null;
      }

      // Crear objeto Ticket
      const mappedTicket: Ticket = {
        id: `#${ticketData.id}`,
        rawId: ticketData.id,
        subject: ticketData.name || 'Sin asunto',
        status: STATUS_MAP[ticketData.status || 1] || 'pendiente',
        statusCode: ticketData.status || 1,
        priority: PRIORITY_MAP[ticketData.priority || 3] || 'media',
        date: formatDate(ticketData.date || ticketData.date_creation),
        category: 'Sin categoría',
        assignedTo: 'Sin asignar',
        group: null,
        lastUpdate: null,
        lastUpdateDate: null,
      };

      setTicket(mappedTicket);
      return mappedTicket;

    } catch (error) {
      console.error('Error cargando ticket:', error);
      setValidationError('Error al cargar el ticket');
      return null;
    } finally {
      setIsLoadingTicket(false);
    }
  }, []);

  // Efecto principal para validar y cargar - se ejecuta solo una vez
  useEffect(() => {
    // Evitar ejecución múltiple
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const validateAndLoad = async () => {
      // Validar parámetros
      if (!mail || !idticket) {
        setValidationError('Faltan parámetros requeridos en la URL (mail, idticket)');
        setIsValidating(false);
        return;
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(mail)) {
        setValidationError('El formato del correo no es válido');
        setIsValidating(false);
        return;
      }

      // Validar dominio
      const emailDomain = mail.split('@')[1]?.toLowerCase();
      if (emailDomain !== 'chevyplan.com.ec') {
        setValidationError('Solo se permiten correos del dominio @chevyplan.com.ec');
        setIsValidating(false);
        return;
      }

      // Validar que idticket sea un número
      const ticketId = parseInt(idticket, 10);
      if (isNaN(ticketId) || ticketId <= 0) {
        setValidationError('El ID del ticket no es válido');
        setIsValidating(false);
        return;
      }

      try {
        // 1. Validar email contra el servidor
        const validationResult = await validateEmail(mail);
        if (!validationResult.success) {
          setValidationError(validationResult.error || 'Error al validar el correo');
          setIsValidating(false);
          return;
        }
        if (validationResult.user?.givenName) {
          setUserName(validationResult.user.givenName);
        }

        // 2. Iniciar sesión GLPI
        const sessionResult = await initSession();
        if (!sessionResult?.session_token) {
          setValidationError('Error al iniciar sesión en GLPI');
          setIsValidating(false);
          return;
        }
        setGlpiSessionToken(sessionResult.session_token);

        // 3. Obtener usuario GLPI
        const user = await getGlpiUser(sessionResult.session_token, mail);
        if (!user) {
          setValidationError('No se encontró el usuario en GLPI');
          setIsValidating(false);
          return;
        }
        setGlpiUser(user);

        // 4. Cargar el ticket y validar que pertenece al usuario
        const loadedTicket = await loadTicketById(sessionResult.session_token, ticketId, user.id);
        if (loadedTicket) {
          // 5. Cargar el timeline
          await loadTicketTimeline(sessionResult.session_token, loadedTicket);
        }

        setIsValidating(false);

      } catch (error) {
        console.error('Error en validación:', error);
        setValidationError('Error durante la validación');
        setIsValidating(false);
      }
    };

    validateAndLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mail, idticket]);

  // Handler para enviar comentario
  const handleSendComment = useCallback(async () => {
    if (!newComment.trim() && attachments.length === 0) return;
    const sessionToken = sessionTokenRef.current;
    if (!ticket || !sessionToken) return;

    setIsSendingComment(true);
    setCommentError(null);
    setCommentSuccess(null);
    setAttachmentError(null);

    try {
      const { sendFollowup, uploadDocument } = await import('@/services/glpiApi');
      let uploadErrors = 0;

      // Subir archivos primero
      for (const attachment of attachments) {
        const result = await uploadDocument(sessionToken, attachment.file, ticket.rawId, glpiUser?.id);
        if (!result.success) {
          uploadErrors++;
        }
      }

      // Enviar comentario de texto
      if (newComment.trim()) {
        const result = await sendFollowup(sessionToken, ticket.rawId, newComment.trim(), glpiUser?.id);
        if (!result.success) {
          setCommentError(result.error || 'Error al enviar el comentario');
          setIsSendingComment(false);
          return;
        }
      }

      // Mostrar mensaje de éxito
      if (uploadErrors === 0) {
        const hasFiles = attachments.length > 0;
        const hasText = newComment.trim().length > 0;
        const successMsg = hasFiles && hasText
          ? 'Mensaje y archivos enviados exitosamente'
          : hasFiles
          ? 'Archivos subidos exitosamente'
          : 'Comentario enviado exitosamente';
        setCommentSuccess(successMsg);
      } else {
        setAttachmentError(`${uploadErrors} archivo(s) no se pudieron subir`);
      }

      // Limpiar y recargar
      setNewComment('');
      setAttachments([]);
      await loadTicketTimeline(sessionToken, ticket);

      setTimeout(() => setCommentSuccess(null), 3000);

    } catch (error) {
      console.error('Error enviando comentario:', error);
      setCommentError('Error al enviar el comentario');
    } finally {
      setIsSendingComment(false);
    }
  }, [newComment, attachments, ticket, glpiUser, loadTicketTimeline]);

  // Handler para seleccionar archivos
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILES = 4;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ];

    setAttachmentError(null);

    const remainingSlots = MAX_FILES - attachments.length;
    if (remainingSlots <= 0) {
      setAttachmentError(`Máximo ${MAX_FILES} archivos permitidos`);
      e.target.value = '';
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    const validFiles: import('@/types').CommentAttachment[] = [];

    for (const file of filesToAdd) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setAttachmentError(`Tipo de archivo no permitido: ${file.name}`);
        continue;
      }
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
      setAttachments(prev => [...prev, ...validFiles]);
    }

    e.target.value = '';
  }, [attachments.length]);

  // Handler para remover attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter(a => a.id !== id);
    });
  }, []);

  // Handler para refrescar timeline
  const handleRefreshTimeline = useCallback(() => {
    const sessionToken = sessionTokenRef.current;
    if (ticket && sessionToken) {
      loadTicketTimeline(sessionToken, ticket);
    }
  }, [ticket, loadTicketTimeline]);

  // Handler para cerrar (ir a página principal)
  const handleClose = useCallback(() => {
    window.location.href = '/';
  }, []);

  // Mostrar loading mientras valida
  if (isValidating || isLoadingTicket) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-lg text-slate-700 font-medium">
            {isValidating ? 'Validando acceso...' : 'Cargando ticket...'}
          </p>
          {mail && (
            <p className="text-sm text-slate-500">{mail}</p>
          )}
        </div>
      </div>
    );
  }

  // Mostrar error
  if (validationError) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-red-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 text-center">Error de Acceso</h2>
          <p className="text-slate-600 text-center">{validationError}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  // Mostrar el modal de detalle del ticket a pantalla completa
  if (ticket) {
    return (
      <TicketDetailModal
        ticket={ticket}
        timelineMessages={timelineMessages}
        isLoading={isLoadingDetail}
        isExpanded={true}
        setIsExpanded={() => {}}
        newComment={newComment}
        setNewComment={setNewComment}
        isSendingComment={isSendingComment}
        commentSuccess={commentSuccess}
        commentError={commentError}
        commentTextareaRef={commentTextareaRef}
        onSendComment={handleSendComment}
        onClose={handleClose}
        attachments={attachments}
        attachmentFileInputRef={attachmentFileInputRef}
        onFileSelect={handleFileSelect}
        onRemoveAttachment={removeAttachment}
        hasAttachments={attachments.length > 0}
        attachmentError={attachmentError}
        sessionToken={glpiSessionToken}
        onRefreshTimeline={handleRefreshTimeline}
        loggedInUserId={glpiUser?.id}
      />
    );
  }

  return null;
}

export default function DetalleTicketPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-lg text-slate-700 font-medium">Cargando...</p>
        </div>
      </div>
    }>
      <DetalleTicketContent />
    </Suspense>
  );
}
