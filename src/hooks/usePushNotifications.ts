// src/hooks/usePushNotifications.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | 'default';
  isLoading: boolean;
  error: string | null;
}

interface UsePushNotificationsReturn extends PushNotificationState {
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
}

// Convertir la clave VAPID de base64 a Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Detectar tipo de dispositivo
function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function usePushNotifications(userEmail: string | null): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    permission: 'default',
    isLoading: true,
    error: null,
  });

  // Verificar si push notifications están soportadas
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      if (!isSupported) {
        setState(prev => ({
          ...prev,
          isSupported: false,
          isLoading: false,
          error: 'Push notifications no soportadas en este navegador',
        }));
        return;
      }

      // Verificar permiso actual
      const permission = Notification.permission;

      setState(prev => ({
        ...prev,
        isSupported: true,
        permission,
        isLoading: false,
      }));

      // Si ya hay permiso, verificar suscripción
      if (permission === 'granted') {
        checkExistingSubscription();
      }
    };

    checkSupport();
  }, []);

  // Verificar si ya existe una suscripción
  const checkExistingSubscription = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      setState(prev => ({
        ...prev,
        isSubscribed: !!subscription,
      }));
    } catch (error) {
      console.error('[Push] Error verificando suscripción:', error);
    }
  }, []);

  // Registrar el Service Worker
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      // Primero intentar obtener el registro existente
      let registration = await navigator.serviceWorker.getRegistration('/');

      if (registration) {
        console.log('[Push] Service Worker existente encontrado');

        // Si hay una actualización pendiente, activarla
        if (registration.waiting) {
          console.log('[Push] Activando Service Worker en espera');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Verificar si necesita actualización
        await registration.update();
      } else {
        // Registrar nuevo
        console.log('[Push] Registrando nuevo Service Worker');
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
      }

      console.log('[Push] Service Worker registrado:', registration.scope);

      // Esperar a que esté listo
      const readyRegistration = await navigator.serviceWorker.ready;
      console.log('[Push] Service Worker ready:', readyRegistration.scope);

      // Esperar a que haya un SW activo
      if (!readyRegistration.active) {
        console.log('[Push] Esperando activación del Service Worker...');
        await new Promise<void>((resolve) => {
          const sw = readyRegistration.installing || readyRegistration.waiting;
          if (!sw) {
            resolve();
            return;
          }
          sw.addEventListener('statechange', function onStateChange() {
            if (sw.state === 'activated') {
              sw.removeEventListener('statechange', onStateChange);
              resolve();
            }
          });
          // Timeout de seguridad
          setTimeout(resolve, 2000);
        });
      }

      console.log('[Push] Service Worker activo:', readyRegistration.active?.state);

      return readyRegistration;
    } catch (error) {
      console.error('[Push] Error registrando Service Worker:', error);
      return null;
    }
  }, []);

  // Solicitar permiso de notificaciones
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Push no soportado' }));
      return false;
    }

    try {
      const permission = await Notification.requestPermission();

      setState(prev => ({
        ...prev,
        permission,
        error: permission === 'denied' ? 'Permisos de notificación denegados' : null,
      }));

      return permission === 'granted';
    } catch (error) {
      console.error('[Push] Error solicitando permiso:', error);
      setState(prev => ({ ...prev, error: 'Error al solicitar permisos' }));
      return false;
    }
  }, [state.isSupported]);

  // Suscribirse a push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!userEmail) {
      setState(prev => ({ ...prev, error: 'Se requiere email de usuario' }));
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      setState(prev => ({ ...prev, error: 'VAPID key no configurada' }));
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Registrar Service Worker
      const registration = await registerServiceWorker();
      if (!registration) {
        throw new Error('No se pudo registrar el Service Worker');
      }

      // Solicitar permiso si es necesario
      if (Notification.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setState(prev => ({ ...prev, isLoading: false }));
          return false;
        }
      }

      // Suscribirse a push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      console.log('[Push] Suscripción creada:', subscription.endpoint);

      // Enviar suscripción al servidor
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userEmail,
          deviceType: getDeviceType(),
          userAgent: navigator.userAgent,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Caso especial: dispositivo registrado para otro usuario (409)
        if (response.status === 409 && result.alreadyRegistered) {
          console.log('[Push] Dispositivo ya registrado para otro usuario, continuando sin error');
          setState(prev => ({
            ...prev,
            isSubscribed: false,
            isLoading: false,
            error: null, // No mostrar como error, es un caso válido
          }));
          return false;
        }
        throw new Error(result.error || 'Error al registrar suscripción');
      }

      console.log('[Push] Suscripción registrada en servidor:', result);

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      console.error('[Push] Error en suscripción:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Error al suscribirse',
      }));
      return false;
    }
  }, [userEmail, registerServiceWorker, requestPermission]);

  // Cancelar suscripción
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Cancelar en el navegador
        await subscription.unsubscribe();

        // Eliminar del servidor
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            userEmail,
          }),
        });
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      console.error('[Push] Error cancelando suscripción:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Error al cancelar suscripción',
      }));
      return false;
    }
  }, [userEmail]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}
