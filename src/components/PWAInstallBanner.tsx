// src/components/PWAInstallBanner.tsx
'use client';

import { useState, useEffect } from 'react';
import { Download, X, Bell, BellOff, Share } from 'lucide-react';
import { usePWAInstall, usePushNotifications } from '@/hooks';

export function PWAInstallBanner() {
  const { isInstalled, isInstallable, isIOS, promptInstall } = usePWAInstall();
  const { isSubscribed, permission, isSupported: pushSupported, subscribe } = usePushNotifications(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Verificar si ya se descartó antes
  useEffect(() => {
    const dismissedUntil = localStorage.getItem('pwa-banner-dismissed');
    if (dismissedUntil) {
      const until = new Date(dismissedUntil);
      if (until > new Date()) {
        setDismissed(true);
      } else {
        localStorage.removeItem('pwa-banner-dismissed');
      }
    }
  }, []);

  // Descartar por 7 días
  const handleDismiss = () => {
    const until = new Date();
    until.setDate(until.getDate() + 7);
    localStorage.setItem('pwa-banner-dismissed', until.toISOString());
    setDismissed(true);
  };

  // Mostrar banner de instalación si no está instalada y no fue descartada
  const shouldShowInstallBanner = !isInstalled && !dismissed && (isInstallable || isIOS);

  // Mostrar indicador de push notifications
  const showPushIndicator = pushSupported && !isSubscribed && permission !== 'denied';

  if (!shouldShowInstallBanner && !showPushIndicator) {
    return null;
  }

  return (
    <>
      {/* Banner de instalación */}
      {shouldShowInstallBanner && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 relative">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Instala la app</p>
                <p className="text-xs text-blue-100 truncate">
                  {isIOS
                    ? 'Accede más rápido desde tu pantalla de inicio'
                    : 'Recibe notificaciones y accede más rápido'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {isIOS ? (
                <button
                  onClick={() => setShowIOSInstructions(true)}
                  className="bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors flex items-center gap-1"
                >
                  <Share className="w-4 h-4" />
                  Instalar
                </button>
              ) : isInstallable ? (
                <button
                  onClick={promptInstall}
                  className="bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
                >
                  Instalar
                </button>
              ) : null}

              <button
                onClick={handleDismiss}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de push notifications desactivadas */}
      {showPushIndicator && !shouldShowInstallBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-amber-800">
              <BellOff className="w-4 h-4" />
              <p className="text-sm">
                Activa las notificaciones para recibir actualizaciones de tus tickets
              </p>
            </div>
            <button
              onClick={() => subscribe()}
              className="flex items-center gap-1 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <Bell className="w-4 h-4" />
              Activar
            </button>
          </div>
        </div>
      )}

      {/* Modal de instrucciones iOS */}
      {showIOSInstructions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Instalar en iPhone/iPad</h3>
              <button
                onClick={() => setShowIOSInstructions(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium text-slate-900">Toca el botón Compartir</p>
                  <p className="text-sm text-slate-500">
                    En la barra inferior de Safari, toca el ícono{' '}
                    <Share className="w-4 h-4 inline" />
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium text-slate-900">Selecciona &quot;Agregar a Inicio&quot;</p>
                  <p className="text-sm text-slate-500">
                    Desliza hacia abajo en el menú y busca esta opción
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium text-slate-900">Confirma la instalación</p>
                  <p className="text-sm text-slate-500">
                    Toca &quot;Agregar&quot; en la esquina superior derecha
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSInstructions(false)}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
