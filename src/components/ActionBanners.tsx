// src/components/ActionBanners.tsx
'use client';

import { Plus, FileText } from 'lucide-react';

interface ActionBannersProps {
  onOpenCreateTicket: () => void;
  onOpenConsultTickets: () => void;
}

export function ActionBanners({ onOpenCreateTicket, onOpenConsultTickets }: ActionBannersProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Banner 1: Abrir Ticket */}
      <button
        onClick={onOpenCreateTicket}
        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#00549B] to-[#0070CC] p-6 text-left shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

        <div className="relative z-10">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">
            Abrir Ticket
          </h2>
          <p className="text-blue-200 mb-3">
            Crea un nuevo ticket de soporte técnico
          </p>

          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <span>Comenzar ahora</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Banner 2: Consultar Tickets */}
      <button
        onClick={onOpenConsultTickets}
        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 p-6 text-left shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />

        <div className="relative z-10">
          <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">
            Consultar Tickets
          </h2>
          <p className="text-slate-300 mb-3">
            Revisa el estado de tus solicitudes
          </p>

          <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
            <span>Ver mis tickets</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>
    </div>
  );
}
