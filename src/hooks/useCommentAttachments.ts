// src/hooks/useCommentAttachments.ts
'use client';

import { useState, useRef, useCallback } from 'react';
import type { CommentAttachment } from '@/types';

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

interface UseCommentAttachmentsReturn {
  attachments: CommentAttachment[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeAttachment: (id: string) => void;
  updateStatus: (id: string, status: CommentAttachment['status']) => void;
  clearAttachments: () => void;
  hasAttachments: boolean;
  validationError: string | null;
  clearError: () => void;
}

export function useCommentAttachments(): UseCommentAttachmentsReturn {
  const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setValidationError(null);

    // Verificar límite de archivos
    const remainingSlots = MAX_FILES - attachments.length;
    if (remainingSlots <= 0) {
      setValidationError(`Máximo ${MAX_FILES} archivos permitidos`);
      e.target.value = '';
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    const validFiles: CommentAttachment[] = [];

    for (const file of filesToAdd) {
      // Validar tipo
      if (!ALLOWED_TYPES.includes(file.type)) {
        setValidationError(`Tipo de archivo no permitido: ${file.name}`);
        continue;
      }

      // Validar tamaño
      if (file.size > MAX_FILE_SIZE) {
        setValidationError(`Archivo muy grande (máx 10MB): ${file.name}`);
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

  const updateStatus = useCallback((id: string, status: CommentAttachment['status']) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setAttachments([]);
    setValidationError(null);
  }, [attachments]);

  const clearError = useCallback(() => {
    setValidationError(null);
  }, []);

  return {
    attachments,
    fileInputRef,
    handleFileSelect,
    removeAttachment,
    updateStatus,
    clearAttachments,
    hasAttachments: attachments.length > 0,
    validationError,
    clearError,
  };
}
