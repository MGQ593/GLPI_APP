// src/components/modals/EmailModal.tsx
'use client';

import { X, Mail, AlertCircle } from 'lucide-react';
import type { ModalType } from '@/types';

interface EmailModalProps {
  modalType: ModalType;
  email: string;
  setEmail: (email: string) => void;
  errorMessage: string;
  setErrorMessage: (msg: string) => void;
  isLoading: boolean;
  onValidate: () => void;
  onClose: () => void;
}

export function EmailModal({
  modalType,
  email,
  setEmail,
  errorMessage,
  setErrorMessage,
  isLoading,
  onValidate,
  onClose,
}: EmailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 animate-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
            {modalType === 'create' ? 'Crear Ticket' : 'Consultar Tickets'}
          </h3>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
          </div>
          <p className="text-center text-slate-600 text-sm sm:text-base">
            Ingresa tu correo electrónico corporativo
          </p>
          <p className="text-center text-xs text-slate-400 mt-2">
            Solo correos @chevyplan.com.ec
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Correo Electrónico
            </label>
            <input
              id="user-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMessage('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && onValidate()}
              placeholder="usuario@chevyplan.com.ec"
              disabled={isLoading}
              className={`w-full h-12 px-4 rounded-xl border-2 transition-all outline-none text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed ${
                errorMessage
                  ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-100'
                  : 'border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
              }`}
            />
            {errorMessage && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {errorMessage}
              </p>
            )}
          </div>

          <button
            onClick={onValidate}
            disabled={isLoading}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm sm:text-base font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Validando...
              </>
            ) : (
              'Validar Correo'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
