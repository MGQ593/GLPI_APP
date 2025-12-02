// src/hooks/useFileAttachments.ts
'use client';

import { useState, useRef, useCallback } from 'react';
import type { AttachedFile } from '@/types';

const MAX_FILES = 4;

interface UseFileAttachmentsReturn {
  attachedFiles: AttachedFile[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: (index: number) => void;
  clearFiles: () => void;
  MAX_FILES: number;
}

export function useFileAttachments(): UseFileAttachmentsReturn {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Verificar límite de archivos
    const remainingSlots = MAX_FILES - attachedFiles.length;
    if (remainingSlots <= 0) {
      alert(`Ya tienes ${MAX_FILES} archivos adjuntos. Elimina alguno para agregar más.`);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      // Validar tamaño (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`El archivo "${file.name}" es demasiado grande. Máximo 10MB permitido.`);
        return;
      }

      // Validar tipo de archivo
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'
      ];
      if (!allowedTypes.includes(file.type)) {
        alert(`El archivo "${file.name}" no es un tipo permitido. Solo JPG, PNG, GIF, PDF, MP4, WEBM, MOV y AVI.`);
        return;
      }

      // Convertir a base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setAttachedFiles((prev) => {
          // Verificar que no exceda el máximo
          if (prev.length >= MAX_FILES) return prev;
          // Verificar que no sea duplicado
          if (prev.some((f) => f.name === file.name && f.size === file.size)) return prev;
          return [...prev, {
            name: file.name,
            type: file.type,
            size: file.size,
            base64: base64,
          }];
        });
      };
      reader.readAsDataURL(file);
    });

    // Limpiar inputs para permitir seleccionar el mismo archivo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  }, [attachedFiles.length]);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  return {
    attachedFiles,
    fileInputRef,
    cameraInputRef,
    handleFileSelect,
    handleRemoveFile,
    clearFiles,
    MAX_FILES,
  };
}
