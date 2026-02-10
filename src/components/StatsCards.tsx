// src/components/StatsCards.tsx
'use client';

import { useState, useEffect } from 'react';
import { Clock, Star, Users } from 'lucide-react';

interface StatsData {
  satisfaction: number | null;
  satisfactionCount: number;
  queueCount: number | null;
}

export function StatsCards() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error cargando estadísticas:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const satisfactionDisplay = loading
    ? '...'
    : stats?.satisfaction != null
      ? `${stats.satisfaction}/5`
      : '-/5';

  const queueDisplay = loading
    ? '...'
    : stats?.queueCount != null
      ? String(stats.queueCount)
      : '-';

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
          <Clock className="w-5 h-5 text-blue-600" />
        </div>
        <div className="text-xl sm:text-2xl font-bold text-slate-900">&lt;2h</div>
        <div className="text-xs text-slate-500 mt-0.5">Tiempo respuesta</div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mx-auto mb-2">
          <Star className="w-5 h-5 text-amber-500" />
        </div>
        <div className={`text-xl sm:text-2xl font-bold text-slate-900 ${loading ? 'animate-pulse' : ''}`}>
          {satisfactionDisplay}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">Satisfacción</div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
        <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
          <Users className="w-5 h-5 text-emerald-600" />
        </div>
        <div className={`text-xl sm:text-2xl font-bold text-slate-900 ${loading ? 'animate-pulse' : ''}`}>
          {queueDisplay}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">En Cola</div>
      </div>
    </div>
  );
}
