// src/types/index.ts

export interface GlpiUser {
  id: number;
  username: string;
  firstname: string;
  realname: string;
  email: string;
  phone: string;
  location_id: string;
  usertitle_id: string;
  userTitle: string; // Título/Cargo del usuario (ej: "Analista de Operaciones")
}

export interface Ticket {
  id: string;
  rawId: number;
  subject: string;
  status: string;
  statusCode: number;
  priority: string;
  date: string | null;
  category: string;
  assignedTo: string;
  group: string | null;
  lastUpdate: string | null;
  lastUpdateDate: string | null;
  content?: string;
}

export interface TimelineDocument {
  id: number;
  name: string;
  filename: string;
  mime: string;
  filesize: number;
}

export interface TimelineSolution {
  id: number;
  status: number; // 2=pendiente, 3=aprobada, 4=rechazada
}

export interface TimelineMessage {
  id: number | string;
  type: 'initial' | 'followup' | 'solution' | 'document';
  date: string;
  rawDate: string;
  userId: number;
  userName: string;
  userInitials: string;
  content: string;
  isPrivate: boolean;
  isAgent: boolean;
  document?: TimelineDocument;
  documents?: TimelineDocument[];  // Array de documentos adjuntos al mensaje
  solution?: TimelineSolution;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

export interface CommentAttachment {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
}

export interface SessionConfig {
  timeoutMs: number;
  warningMs: number;
}

export interface UserNameData {
  firstname: string;
  realname: string;
}

export type ModalType = 'create' | 'consult';

export type TicketStatus = 'nuevo' | 'pendiente' | 'en-progreso' | 'resuelto' | 'cerrado';

export type TicketPriority = 'muy-alta' | 'mayor' | 'alta' | 'media' | 'baja' | 'muy-baja';
