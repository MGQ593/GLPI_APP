// src/components/StatsCards.tsx
'use client';

import { Clock } from 'lucide-react';

export function StatsCards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8 max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl p-4 shadow-lg border border-slate-200 text-center">
        <div className="text-2xl font-bold text-slate-900 mb-1">&lt;2h</div>
        <div className="text-xs text-slate-600">Tiempo respuesta</div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-lg border border-slate-200 text-center">
        <div className="text-2xl font-bold text-slate-900 mb-1">4.8/5</div>
        <div className="text-xs text-slate-600">Satisfacción</div>
      </div>
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl p-4 shadow-lg border-2 border-amber-200 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-200/30 rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="w-5 h-5 text-amber-600" />
            <div className="text-2xl font-bold text-amber-900">12</div>
          </div>
          <div className="text-xs text-amber-700 font-medium">En Cola</div>
        </div>
      </div>
    </div>
  );
}
