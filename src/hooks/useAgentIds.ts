// src/hooks/useAgentIds.ts
'use client';

import { useState, useCallback } from 'react';
import { getTicketUsers, getTicketGroups, getGroupUsers } from '@/services/glpiApi';

export function useAgentIds(sessionToken: string | null) {
  const [agentIdsCache, setAgentIdsCache] = useState<Record<number, number[]>>({});

  const getAgentIds = useCallback(async (ticketId: number): Promise<number[]> => {
    // Verificar cache primero
    if (agentIdsCache[ticketId]) {
      return agentIdsCache[ticketId];
    }

    if (!sessionToken) return [];

    const agentIds: number[] = [];

    // 1. Obtener técnicos directos del ticket
    const ticketUsers = await getTicketUsers(sessionToken, ticketId);
    const directTechs = ticketUsers
      .filter(u => u.type === 2) // type === 2 significa técnico asignado
      .map(u => u.users_id);
    agentIds.push(...directTechs);

    // 2. Obtener grupos técnicos del ticket
    const groupTickets = await getTicketGroups(sessionToken, ticketId);
    const techGroupIds = groupTickets
      .filter(g => g.type === 2) // type === 2 significa grupo técnico
      .map(g => g.groups_id);

    // 3. Obtener miembros de cada grupo técnico
    for (const groupId of techGroupIds) {
      const groupUsers = await getGroupUsers(sessionToken, groupId);
      const groupTechs = groupUsers.map(m => m.users_id);
      agentIds.push(...groupTechs);
    }

    // Eliminar duplicados
    const uniqueAgentIds = [...new Set(agentIds)];

    // Guardar en cache
    setAgentIdsCache(prev => ({ ...prev, [ticketId]: uniqueAgentIds }));

    return uniqueAgentIds;
  }, [sessionToken, agentIdsCache]);

  return {
    agentIdsCache,
    getAgentIds,
  };
}
