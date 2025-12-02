// src/services/glpiApi.ts
import type { GlpiUser, Ticket, UserNameData } from '@/types';
import { logger } from './logger';

export interface TicketDocument {
  id: number;
  name: string;
  filename: string;
  filepath: string;
  mime: string;
  date_creation: string;
  users_id: number;
  filesize: number;
  itemtype?: string;  // 'ITILFollowup', 'Ticket', 'ITILSolution'
  items_id?: number;  // ID del followup/solution al que está asociado
}

/**
 * Inicializa una sesión GLPI
 */
export async function initSession(): Promise<{ session_token: string } | null> {
  try {
    const response = await fetch('/api/glpi/session', { method: 'POST' });
    const data = await response.json();
    if (response.ok && data.session_token) {
      logger.info('Sesión GLPI iniciada correctamente');
      return { session_token: data.session_token };
    }
    logger.warn('No se pudo iniciar sesión GLPI', { response: data });
    return null;
  } catch (error) {
    logger.error('Error iniciando sesión GLPI', { error: String(error) });
    return null;
  }
}

/**
 * Cierra una sesión GLPI
 */
export async function closeSession(sessionToken: string): Promise<boolean> {
  try {
    await fetch(`/api/glpi/session?session_token=${sessionToken}`, { method: 'DELETE' });
    logger.info('Sesión GLPI cerrada correctamente');
    return true;
  } catch (error) {
    logger.error('Error cerrando sesión GLPI', { error: String(error) });
    return false;
  }
}

/**
 * Valida el email del usuario
 */
export async function validateEmail(email: string): Promise<{ success: boolean; user?: { givenName: string }; error?: string }> {
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const data = await response.json();
    if (!response.ok) {
      logger.warn('Validación de email fallida', { email, error: data.error });
      return { success: false, error: data.error || 'Error al validar el correo' };
    }
    logger.info('Email validado correctamente', { email });
    return { success: true, user: data.user };
  } catch (error) {
    logger.error('Error de conexión validando email', { email, error: String(error) });
    return { success: false, error: 'Error de conexión. Intenta nuevamente.' };
  }
}

/**
 * Obtiene un usuario GLPI por email
 */
export async function getGlpiUser(sessionToken: string, email: string): Promise<GlpiUser | null> {
  try {
    const response = await fetch(
      `/api/glpi/user?email=${encodeURIComponent(email)}&session_token=${encodeURIComponent(sessionToken)}`
    );
    const data = await response.json();
    if (response.ok && data.user) {
      logger.info('Usuario GLPI obtenido', { userId: data.user.id, email });
      return data.user;
    }
    logger.warn('Usuario GLPI no encontrado', { email });
    return null;
  } catch (error) {
    logger.error('Error buscando usuario en GLPI', { email, error: String(error) });
    return null;
  }
}

/**
 * Obtiene los tickets de un usuario
 */
export async function getTickets(sessionToken: string, userId: number): Promise<Ticket[]> {
  try {
    const response = await fetch(
      `/api/glpi/tickets?user_id=${userId}&session_token=${encodeURIComponent(sessionToken)}`
    );
    const data = await response.json();
    if (response.ok && data.tickets) {
      logger.info('Tickets obtenidos', { userId, count: data.tickets.length });
      return data.tickets;
    }
    logger.warn('No se pudieron obtener tickets', { userId });
    return [];
  } catch (error) {
    logger.error('Error buscando tickets', { userId, error: String(error) });
    return [];
  }
}

/**
 * Obtiene el detalle de un ticket
 */
export async function getTicketDetail(sessionToken: string, ticketId: number): Promise<{ success: boolean; ticket?: Record<string, unknown> }> {
  try {
    const response = await fetch(`/api/glpi/ticket/${ticketId}?session_token=${sessionToken}`);
    const data = await response.json();
    if (data.success) {
      logger.debug('Detalle de ticket obtenido', { ticketId });
    }
    return data;
  } catch (error) {
    logger.error('Error obteniendo detalle del ticket', { ticketId, error: String(error) });
    return { success: false };
  }
}

/**
 * Obtiene los followups de un ticket
 */
export async function getFollowups(sessionToken: string, ticketId: number): Promise<{ success: boolean; followups?: Record<string, unknown>[] }> {
  try {
    // Agregar timestamp para evitar cache del navegador
    const cacheBuster = Date.now();
    const response = await fetch(`/api/glpi/ticket/${ticketId}/followup?session_token=${sessionToken}&_t=${cacheBuster}`);
    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Error obteniendo followups', { ticketId, error: String(error) });
    return { success: false };
  }
}

/**
 * Obtiene las soluciones de un ticket
 */
export async function getSolutions(sessionToken: string, ticketId: number): Promise<{ success: boolean; solutions?: Record<string, unknown>[] }> {
  try {
    const response = await fetch(`/api/glpi/ticket/${ticketId}/solution?session_token=${sessionToken}`);
    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Error obteniendo soluciones', { ticketId, error: String(error) });
    return { success: false };
  }
}

/**
 * Envía un followup (comentario) a un ticket
 */
export async function sendFollowup(sessionToken: string, ticketId: number, content: string, userId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/glpi/ticket/${ticketId}/followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, session_token: sessionToken, users_id: userId }),
    });
    const data = await response.json();
    if (data.success) {
      logger.info('Comentario enviado', { ticketId, userId });
    } else {
      logger.warn('Error al enviar comentario', { ticketId, error: data.error });
    }
    return data;
  } catch (error) {
    logger.error('Error enviando comentario', { ticketId, error: String(error) });
    return { success: false, error: 'Error al enviar el comentario' };
  }
}

/**
 * Obtiene un usuario por ID
 */
export async function getUser(sessionToken: string, userId: number): Promise<UserNameData> {
  try {
    const response = await fetch(`/api/glpi/user/${userId}?session_token=${sessionToken}`);
    const data = await response.json();
    if (data.success && data.user) {
      return {
        firstname: data.user.firstname || '',
        realname: data.user.realname || data.user.name || '',
      };
    }
  } catch (error) {
    logger.error('Error obteniendo nombre de usuario', { userId, error: String(error) });
  }
  return { firstname: '', realname: `Usuario ${userId}` };
}

/**
 * Obtiene los usuarios asignados a un ticket
 */
export async function getTicketUsers(sessionToken: string, ticketId: number): Promise<{ type: number; users_id: number }[]> {
  try {
    const response = await fetch(`/api/glpi/ticket/${ticketId}/users?session_token=${sessionToken}`);
    const data = await response.json();
    if (data.success && Array.isArray(data.ticketUsers)) {
      return data.ticketUsers;
    }
    return [];
  } catch (error) {
    logger.error('Error obteniendo usuarios del ticket', { ticketId, error: String(error) });
    return [];
  }
}

/**
 * Obtiene los grupos asignados a un ticket
 */
export async function getTicketGroups(sessionToken: string, ticketId: number): Promise<{ type: number; groups_id: number }[]> {
  try {
    const response = await fetch(`/api/glpi/ticket/${ticketId}/groups?session_token=${sessionToken}`);
    const data = await response.json();
    if (data.success && Array.isArray(data.groupTickets)) {
      return data.groupTickets;
    }
    return [];
  } catch (error) {
    logger.error('Error obteniendo grupos del ticket', { ticketId, error: String(error) });
    return [];
  }
}

/**
 * Obtiene los usuarios de un grupo
 */
export async function getGroupUsers(sessionToken: string, groupId: number): Promise<{ users_id: number }[]> {
  try {
    const response = await fetch(`/api/glpi/group/${groupId}/users?session_token=${sessionToken}`);
    const data = await response.json();
    if (data.success && Array.isArray(data.groupUsers)) {
      return data.groupUsers;
    }
    return [];
  } catch (error) {
    logger.error('Error obteniendo usuarios del grupo', { groupId, error: String(error) });
    return [];
  }
}

/**
 * Carga la configuración de sesión
 */
export async function getSessionConfig(): Promise<{ timeoutMs: number; warningMs: number }> {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    if (data.session) {
      logger.debug('Configuración de sesión cargada', data.session);
      return { timeoutMs: data.session.timeoutMs, warningMs: data.session.warningMs };
    }
  } catch (error) {
    logger.error('Error cargando configuración', { error: String(error) });
  }
  return { timeoutMs: 600000, warningMs: 480000 }; // defaults: 10min, 8min
}

/**
 * Sube un documento y lo vincula a un ticket
 */
export async function uploadDocument(
  sessionToken: string,
  file: File,
  ticketId: number,
  userId?: number
): Promise<{ success: boolean; documentId?: number; fileName?: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ticketId', ticketId.toString());
    if (userId) {
      formData.append('users_id', userId.toString());
    }

    const response = await fetch('/api/glpi/document/upload', {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Error subiendo documento', { fileName: file.name, error: data.error });
      return { success: false, error: data.error || 'Error al subir documento' };
    }

    logger.info('Documento subido correctamente', { fileName: file.name, documentId: data.documentId });
    return { success: true, documentId: data.documentId, fileName: data.fileName };
  } catch (error) {
    logger.error('Error subiendo documento', { fileName: file.name, error: String(error) });
    return { success: false, error: 'Error de conexión al subir documento' };
  }
}

/**
 * Obtiene los documentos adjuntos de un ticket
 */
export async function getTicketDocuments(
  sessionToken: string,
  ticketId: number
): Promise<TicketDocument[]> {
  try {
    const response = await fetch(`/api/glpi/ticket/${ticketId}/documents`, {
      headers: {
        'X-Session-Token': sessionToken,
      },
    });

    if (!response.ok) {
      logger.error('Error obteniendo documentos del ticket', { ticketId, status: response.status });
      return [];
    }

    const documents = await response.json();
    logger.debug('Documentos obtenidos', { ticketId, count: documents.length });
    return documents;
  } catch (error) {
    logger.error('Error obteniendo documentos del ticket', { ticketId, error: String(error) });
    return [];
  }
}

/**
 * Aprueba una solución (status = 3) y cierra el ticket automáticamente
 */
export async function approveSolution(
  sessionToken: string,
  solutionId: number,
  userId?: number,
  ticketId?: number
): Promise<boolean> {
  try {
    const response = await fetch(`/api/glpi/solution/${solutionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ status: 3, users_id: userId, ticket_id: ticketId }),
    });

    const data = await response.json();
    logger.info('Respuesta aprobación solución', { solutionId, ticketId, response: data });

    if (response.ok && data.success) {
      logger.info('Solución aprobada', { solutionId, ticketClosed: data.ticketClosed });
      return true;
    }

    logger.error('Error aprobando solución', { solutionId, status: response.status, data });
    return false;
  } catch (error) {
    logger.error('Error aprobando solución', { solutionId, error: String(error) });
    return false;
  }
}

/**
 * Rechaza una solución (status = 4) y reabre el ticket
 */
export async function rejectSolution(
  sessionToken: string,
  solutionId: number,
  userId?: number,
  ticketId?: number
): Promise<boolean> {
  try {
    const response = await fetch(`/api/glpi/solution/${solutionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ status: 4, users_id: userId, ticket_id: ticketId }),
    });

    const data = await response.json();
    logger.info('Respuesta rechazo solución', { solutionId, response: data });

    if (response.ok && data.success) {
      logger.info('Solución rechazada', { solutionId, ticketReopened: data.ticketReopened });
      return true;
    }

    logger.error('Error rechazando solución', { solutionId, status: response.status, data });
    return false;
  } catch (error) {
    logger.error('Error rechazando solución', { solutionId, error: String(error) });
    return false;
  }
}

/**
 * Tipo para el estado de la encuesta
 */
export type SatisfactionStatus = 'draft' | 'pending' | 'completed';

/**
 * Interface para encuesta de satisfacción (sistema propio en PostgreSQL)
 */
export interface TicketSatisfaction {
  id: number;
  glpi_ticket_id: number;
  glpi_user_id: number;
  user_email: string;
  user_name: string | null;
  ticket_subject: string | null;
  ticket_closed_date: string | null;
  satisfaction: number | null;
  comment: string | null;
  status: SatisfactionStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Obtiene la encuesta de satisfacción de un ticket desde PostgreSQL
 */
export async function getTicketSatisfaction(
  _sessionToken: string,
  ticketId: number
): Promise<TicketSatisfaction | null> {
  try {
    const response = await fetch(`/api/satisfaction?ticket_id=${ticketId}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Si no hay datos, retornamos un objeto que indica que se puede calificar
    if (!data) {
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Error obteniendo encuesta de satisfacción', { ticketId, error: String(error) });
    return null;
  }
}

/**
 * Actualiza el status de una encuesta de satisfacción
 * Se usa para cambiar de 'draft' a 'pending' cuando un ticket se cierra
 */
export async function updateSatisfactionStatus(
  ticketId: number,
  userId: number,
  status: SatisfactionStatus
): Promise<boolean> {
  try {
    const response = await fetch('/api/satisfaction', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        glpi_ticket_id: ticketId,
        glpi_user_id: userId,
        status,
      }),
    });

    return response.ok;
  } catch (error) {
    logger.error('Error actualizando status de encuesta', { ticketId, status, error: String(error) });
    return false;
  }
}

/**
 * Datos necesarios para enviar una calificación
 */
export interface SubmitSatisfactionParams {
  ticketId: number;
  userId: number;
  userEmail: string;
  userName?: string;
  ticketSubject?: string;
  ticketClosedDate?: string;
  satisfaction: number;
  comment?: string;
}

/**
 * Envía la calificación de satisfacción a PostgreSQL
 */
export async function submitSatisfaction(
  _sessionToken: string,
  ticketId: number,
  _satisfactionId: number, // Ya no se usa, mantenido para compatibilidad
  satisfaction: number,
  comment?: string,
  extraParams?: {
    userId?: number;
    userEmail?: string;
    userName?: string;
    ticketSubject?: string;
    ticketClosedDate?: string;
  }
): Promise<boolean> {
  try {
    // Primero verificamos si ya existe
    const existingResponse = await fetch(`/api/satisfaction?ticket_id=${ticketId}`);
    const existing = await existingResponse.json();

    if (existing && existing.id) {
      // Actualizar existente
      const response = await fetch('/api/satisfaction', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          glpi_ticket_id: ticketId,
          glpi_user_id: extraParams?.userId || 0,
          satisfaction,
          comment: comment || null,
        }),
      });

      if (response.ok) {
        logger.info('Calificación actualizada', { ticketId, satisfaction });
        return true;
      }
    } else {
      // Crear nueva
      const response = await fetch('/api/satisfaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          glpi_ticket_id: ticketId,
          glpi_user_id: extraParams?.userId || 0,
          user_email: extraParams?.userEmail || '',
          user_name: extraParams?.userName || null,
          ticket_subject: extraParams?.ticketSubject || null,
          ticket_closed_date: extraParams?.ticketClosedDate || null,
          satisfaction,
          comment: comment || null,
        }),
      });

      if (response.ok || response.status === 201) {
        logger.info('Calificación creada', { ticketId, satisfaction });
        return true;
      }

      const errorData = await response.json();
      logger.error('Error creando calificación', { ticketId, error: errorData });
    }

    return false;
  } catch (error) {
    logger.error('Error enviando calificación', { ticketId, error: String(error) });
    return false;
  }
}
