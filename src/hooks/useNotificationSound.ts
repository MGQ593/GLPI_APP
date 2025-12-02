// src/hooks/useNotificationSound.ts
'use client';

import { useCallback, useRef, useEffect } from 'react';

interface UseNotificationSoundReturn {
  playTicketCreated: () => void;
  playTicketUpdated: () => void;
}

export function useNotificationSound(): UseNotificationSoundReturn {
  const audioContextRef = useRef<AudioContext | null>(null);

  // Inicializar AudioContext cuando sea necesario
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Generar sonido de "ding-dong" para ticket creado (más alegre)
  const playTicketCreated = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Primer tono (ding) - más alto
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.value = 880; // A5
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Segundo tono (dong) - armónico
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1174.66; // D6
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.5);

      // Tercer tono (final alegre)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.frequency.value = 1318.51; // E6
      osc3.type = 'sine';
      gain3.gain.setValueAtTime(0.25, now + 0.3);
      gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc3.start(now + 0.3);
      osc3.stop(now + 0.6);

      console.log('[Sound] Reproduciendo sonido de ticket creado');
    } catch (error) {
      console.error('[Sound] Error reproduciendo sonido:', error);
    }
  }, [getAudioContext]);

  // Generar sonido de "ding-dong" para actualización (más suave)
  const playTicketUpdated = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Primer tono (ding)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.value = 659.25; // E5
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Segundo tono (dong) - más bajo
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 523.25; // C5
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.2, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.4);

      console.log('[Sound] Reproduciendo sonido de ticket actualizado');
    } catch (error) {
      console.error('[Sound] Error reproduciendo sonido:', error);
    }
  }, [getAudioContext]);

  return {
    playTicketCreated,
    playTicketUpdated,
  };
}
