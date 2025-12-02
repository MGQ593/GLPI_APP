// src/hooks/useTickets.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Ticket, GlpiUser } from '@/types';
import { getTickets, initSession, getGlpiUser } from '@/services/glpiApi';

interface UseTicketsReturn {
  tickets: Ticket[];
  isLoadingTickets: boolean;
  ticketsLoaded: boolean;
  loadTickets: () => Promise<void>;
  resetTickets: () => void;
}

export function useTickets(
  glpiSessionToken: string | null,
  glpiUser: GlpiUser | null,
  email: string,
  showTickets: boolean,
  isLoadingSession: boolean,
  sessionInitAttempted: boolean,
  onSessionInit: (token: string, user: GlpiUser) => void
): UseTicketsReturn {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);

  const fetchUserTickets = useCallback(async (sessionToken: string, userId: number) => {
    setIsLoadingTickets(true);
    try {
      const ticketsData = await getTickets(sessionToken, userId);
      setTickets(ticketsData);
    } catch {
      setTickets([]);
    } finally {
      setIsLoadingTickets(false);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    if (!glpiSessionToken || !glpiUser?.id) return;
    await fetchUserTickets(glpiSessionToken, glpiUser.id);
    setTicketsLoaded(true);
  }, [glpiSessionToken, glpiUser, fetchUserTickets]);

  const resetTickets = useCallback(() => {
    setTickets([]);
    setTicketsLoaded(false);
  }, []);

  // Efecto para iniciar sesión y cargar tickets cuando se abre la lista de tickets
  useEffect(() => {
    const initAndLoadTickets = async () => {
      if (!showTickets) return;
      if (ticketsLoaded) return;

      // Si no tenemos sesión, iniciarla primero
      if (!glpiSessionToken && !isLoadingSession && !sessionInitAttempted) {
        try {
          const result = await initSession();
          if (result?.session_token) {
            // Obtener usuario y luego tickets
            if (email) {
              const user = await getGlpiUser(result.session_token, email);
              if (user?.id) {
                onSessionInit(result.session_token, user);
                await fetchUserTickets(result.session_token, user.id);
                setTicketsLoaded(true);
              }
            }
          }
        } catch (error) {
          console.error('Error iniciando sesión para tickets:', error);
        }
      } else if (glpiSessionToken && glpiUser?.id && !isLoadingTickets) {
        // Ya tenemos sesión y usuario, solo cargar tickets
        await fetchUserTickets(glpiSessionToken, glpiUser.id);
        setTicketsLoaded(true);
      }
    };

    initAndLoadTickets();
  }, [showTickets, glpiSessionToken, glpiUser, isLoadingSession, sessionInitAttempted, email, onSessionInit, fetchUserTickets, isLoadingTickets, ticketsLoaded]);

  return {
    tickets,
    isLoadingTickets,
    ticketsLoaded,
    loadTickets,
    resetTickets,
  };
}
