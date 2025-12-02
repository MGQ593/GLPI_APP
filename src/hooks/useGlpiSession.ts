// src/hooks/useGlpiSession.ts
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { GlpiUser, SessionConfig } from '@/types';
import { initSession, closeSession, validateEmail, getGlpiUser, getSessionConfig } from '@/services/glpiApi';

interface UseGlpiSessionReturn {
  email: string;
  setEmail: (email: string) => void;
  userName: string;
  glpiUser: GlpiUser | null;
  glpiSessionToken: string | null;
  isLoading: boolean;
  isLoadingSession: boolean;
  errorMessage: string;
  setErrorMessage: (msg: string) => void;
  sessionConfig: SessionConfig;
  showInactivityWarning: boolean;
  secondsRemaining: number;
  handleValidateEmail: () => Promise<boolean>;
  initGlpiSession: () => Promise<void>;
  killGlpiSession: () => Promise<void>;
  resetSession: () => void;
  resetInactivityTimer: () => void;
  extendSession: () => void;
  handleSessionTimeout: () => void;
}

export function useGlpiSession(
  showTicketForm: boolean,
  showTickets: boolean,
  onSessionClose?: () => void
): UseGlpiSessionReturn {
  const [email, setEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [glpiUser, setGlpiUser] = useState<GlpiUser | null>(null);
  const [glpiSessionToken, setGlpiSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionInitAttempted, setSessionInitAttempted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({ timeoutMs: 600000, warningMs: 480000 });
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Referencias para los timers
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const killGlpiSessionRef = useRef<(() => Promise<void>) | null>(null);

  // Cargar configuración de sesión al inicio
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getSessionConfig();
      setSessionConfig(config);
    };
    loadConfig();
  }, []);

  // Función para cerrar sesión por inactividad
  const handleSessionTimeout = useCallback(() => {
    // Limpiar todos los timers
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Cerrar sesión de GLPI
    if (killGlpiSessionRef.current) {
      killGlpiSessionRef.current();
    }

    // Limpiar datos
    setShowInactivityWarning(false);
    setUserName('');
    setEmail('');
    setGlpiSessionToken(null);
    setGlpiUser(null);
    setSessionInitAttempted(false);

    onSessionClose?.();
  }, [onSessionClose]);

  // Función para mostrar advertencia
  const showWarning = useCallback(() => {
    const remainingTime = sessionConfig.timeoutMs - sessionConfig.warningMs;
    setSecondsRemaining(Math.floor(remainingTime / 1000));
    setShowInactivityWarning(true);

    // Iniciar cuenta regresiva
    countdownIntervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          handleSessionTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [sessionConfig, handleSessionTimeout]);

  // Función para resetear el timer de inactividad
  const resetInactivityTimer = useCallback(() => {
    // Limpiar timers existentes
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Ocultar advertencia si está visible
    setShowInactivityWarning(false);

    // Solo iniciar timers si hay un formulario o lista de tickets abiertos
    if (showTicketForm || showTickets) {
      // Timer para mostrar advertencia
      warningTimerRef.current = setTimeout(() => {
        showWarning();
      }, sessionConfig.warningMs);

      // Timer para cerrar sesión
      inactivityTimerRef.current = setTimeout(() => {
        handleSessionTimeout();
      }, sessionConfig.timeoutMs);
    }
  }, [showTicketForm, showTickets, sessionConfig, showWarning, handleSessionTimeout]);

  // Función para extender la sesión
  const extendSession = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setShowInactivityWarning(false);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // Función para buscar usuario en GLPI
  const fetchGlpiUser = useCallback(async (sessionToken: string, userEmail: string) => {
    const user = await getGlpiUser(sessionToken, userEmail);
    if (user) {
      setGlpiUser(user);
      return user;
    }
    return null;
  }, []);

  // Función para inicializar sesión de GLPI
  const initGlpiSession = useCallback(async () => {
    if (glpiSessionToken || sessionInitAttempted) return;

    setSessionInitAttempted(true);
    setIsLoadingSession(true);
    try {
      const result = await initSession();
      if (result?.session_token) {
        setGlpiSessionToken(result.session_token);
        if (email) {
          await fetchGlpiUser(result.session_token, email);
        }
      }
    } finally {
      setIsLoadingSession(false);
    }
  }, [glpiSessionToken, sessionInitAttempted, email, fetchGlpiUser]);

  // Función para cerrar sesión de GLPI
  const killGlpiSession = useCallback(async () => {
    if (!glpiSessionToken) return;
    await closeSession(glpiSessionToken);
    setGlpiSessionToken(null);
  }, [glpiSessionToken]);

  // Actualizar la referencia cuando cambia killGlpiSession
  useEffect(() => {
    killGlpiSessionRef.current = killGlpiSession;
  }, [killGlpiSession]);

  // Validar email
  const handleValidateEmail = useCallback(async (): Promise<boolean> => {
    setErrorMessage('');

    // Validación básica en cliente
    if (!email.trim()) {
      setErrorMessage('Por favor ingresa un correo electrónico');
      return false;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMessage('El formato del correo no es válido');
      return false;
    }

    // Validar dominio en cliente
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain !== 'chevyplan.com.ec') {
      setErrorMessage('Solo se permiten correos del dominio @chevyplan.com.ec');
      return false;
    }

    setIsLoading(true);
    try {
      const result = await validateEmail(email);
      if (!result.success) {
        setErrorMessage(result.error || 'Error al validar el correo');
        return false;
      }
      if (result.user?.givenName) {
        setUserName(result.user.givenName);
      }
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  // Resetear sesión
  const resetSession = useCallback(() => {
    setGlpiSessionToken(null);
    setGlpiUser(null);
    setSessionInitAttempted(false);
    setEmail('');
    setUserName('');
    setErrorMessage('');
  }, []);

  // Efecto para manejar eventos de actividad del usuario
  useEffect(() => {
    if (!showTicketForm && !showTickets) {
      // Limpiar timers cuando no hay formularios abiertos
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      if (!showInactivityWarning) {
        resetInactivityTimer();
      }
    };

    // Agregar listeners
    activityEvents.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    // Iniciar timer
    resetInactivityTimer();

    // Cleanup
    return () => {
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showTicketForm, showTickets, showInactivityWarning, resetInactivityTimer]);

  return {
    email,
    setEmail,
    userName,
    glpiUser,
    glpiSessionToken,
    isLoading,
    isLoadingSession,
    errorMessage,
    setErrorMessage,
    sessionConfig,
    showInactivityWarning,
    secondsRemaining,
    handleValidateEmail,
    initGlpiSession,
    killGlpiSession,
    resetSession,
    resetInactivityTimer,
    extendSession,
    handleSessionTimeout,
  };
}
