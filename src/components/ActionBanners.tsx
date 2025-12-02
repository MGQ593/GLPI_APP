// src/components/ActionBanners.tsx
'use client';

import { Plus, FileText } from 'lucide-react';

interface ActionBannersProps {
  onOpenCreateTicket: () => void;
  onOpenConsultTickets: () => void;
}

export function ActionBanners({ onOpenCreateTicket, onOpenConsultTickets }: ActionBannersProps) {
  return (
    <div className="grid grid-cols-1 gap-6 mb-8">
      {/* Banner 1: Abrir Ticket */}
      <button
        onClick={onOpenCreateTicket}
        className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-left shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

        <div className="relative z-10">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Plus className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">
            Abrir Ticket
          </h2>
          <p className="text-blue-100 text-lg mb-4">
            Crea un nuevo ticket de soporte técnico
          </p>

          <div className="flex items-center gap-2 text-white font-medium">
            <span>Comenzar ahora</span>
            <svg className="w-5 h-5 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Banner 2: Consultar Tickets */}
      <button
        onClick={onOpenConsultTickets}
        className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-700 to-slate-800 p-8 text-left shadow-2xl shadow-slate-500/30 hover:shadow-slate-500/50 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

        <div className="relative z-10">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-3xl font-bold text-white mb-2">
            Consultar Tickets
          </h2>
          <p className="text-slate-300 text-lg mb-4">
            Revisa el estado de tus solicitudes
          </p>

          <div className="flex items-center gap-2 text-white font-medium">
            <span>Ver mis tickets</span>
            <svg className="w-5 h-5 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>
    </div>
  );
}
