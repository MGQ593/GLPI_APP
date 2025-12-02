// src/components/InactivityWarningModal.tsx
'use client';

import { Timer } from 'lucide-react';

interface InactivityWarningModalProps {
  secondsRemaining: number;
  onExtend: () => void;
  onClose: () => void;
}

export function InactivityWarningModal({ secondsRemaining, onExtend, onClose }: InactivityWarningModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 sm:p-8 animate-in zoom-in duration-200 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Timer className="w-8 h-8 text-amber-600" />
        </div>

        <h3 className="text-xl font-bold text-slate-900 mb-2">
          Sesión por expirar
        </h3>

        <p className="text-slate-600 mb-4">
          Tu sesión se cerrará por inactividad en:
        </p>

        <div className="text-4xl font-bold text-amber-600 mb-6">
          {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
        </div>

        <p className="text-sm text-slate-500 mb-6">
          ¿Deseas continuar trabajando?
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onExtend}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 active:scale-95 transition-all"
          >
            Continuar
          </button>
          <button
            onClick={onClose}
            className="w-full h-12 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 active:scale-95 transition-all"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
