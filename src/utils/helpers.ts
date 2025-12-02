// src/utils/helpers.ts

/**
 * Obtiene las iniciales de un nombre
 */
export function getInitials(firstname: string, realname: string): string {
  return `${firstname?.charAt(0) || ''}${realname?.charAt(0) || ''}`.toUpperCase() || '??';
}

/**
 * Verifica si un archivo es una imagen
 */
export function isImageFile(type: string): boolean {
  return type.startsWith('image/');
}

/**
 * Verifica si un archivo es un video
 */
export function isVideoFile(type: string): boolean {
  return type.startsWith('video/');
}
