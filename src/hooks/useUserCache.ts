// src/hooks/useUserCache.ts
'use client';

import { useState, useCallback } from 'react';
import type { UserNameData } from '@/types';
import { getUser } from '@/services/glpiApi';

export function useUserCache(sessionToken: string | null) {
  const [userNamesCache, setUserNamesCache] = useState<Record<number, UserNameData>>({});

  const fetchUserName = useCallback(async (userId: number): Promise<UserNameData> => {
    // Verificar cache primero
    if (userNamesCache[userId]) {
      return userNamesCache[userId];
    }

    if (!sessionToken) {
      return { firstname: '', realname: `Usuario ${userId}` };
    }

    const userData = await getUser(sessionToken, userId);
    setUserNamesCache(prev => ({ ...prev, [userId]: userData }));
    return userData;
  }, [sessionToken, userNamesCache]);

  return {
    userNamesCache,
    fetchUserName,
  };
}
