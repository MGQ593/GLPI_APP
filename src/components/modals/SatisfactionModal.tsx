"use client";

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { StarRating } from '../StarRating';
import { submitSatisfaction } from '@/services/glpiApi';

interface SatisfactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: number;
  ticketName: string;
  satisfactionId: number; // Mantenido por compatibilidad, ya no se usa
  sessionToken: string;
  onSuccess: () => void;
  // Nuevos parámetros para PostgreSQL
  userId?: number;
  userEmail?: string;
  userName?: string;
}

export function SatisfactionModal({
  isOpen,
  onClose,
  ticketId,
  ticketName,
  satisfactionId,
  sessionToken,
  onSuccess,
  userId,
  userEmail,
  userName,
}: SatisfactionModalProps) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      alert('Por favor selecciona una calificación');
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await submitSatisfaction(
        sessionToken,
        ticketId,
        satisfactionId,
        rating,
        comment,
        {
          userId: userId || 0,
          userEmail: userEmail || '',
          userName: userName || undefined,
          ticketSubject: ticketName,
        }
      );

      if (success) {
        onSuccess();
        onClose();
      } else {
        alert('Error al enviar la calificación');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al enviar la calificación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Calificar atención</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Ticket #{ticketId}: <span className="font-medium">{ticketName}</span>
          </p>

          {/* Estrellas */}
          <div className="text-center py-4">
            <p className="text-sm text-gray-600 mb-3">¿Cómo calificarías la atención recibida?</p>
            <div className="flex justify-center">
              <StarRating rating={rating} onRate={setRating} size={32} />
            </div>
            {rating > 0 && (
              <p className="text-sm text-amber-600 mt-2">
                {rating === 1 && 'Muy malo'}
                {rating === 2 && 'Malo'}
                {rating === 3 && 'Regular'}
                {rating === 4 && 'Bueno'}
                {rating === 5 && 'Excelente'}
              </p>
            )}
          </div>

          {/* Comentario */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comentario (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="¿Algún comentario adicional?"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar calificación'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
