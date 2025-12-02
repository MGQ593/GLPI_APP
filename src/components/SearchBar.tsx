// src/components/SearchBar.tsx
'use client';

import { Search } from 'lucide-react';

export function SearchBar() {
  return (
    <div className="mb-6">
      <div className="relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          id="search-articles"
          name="search"
          type="text"
          placeholder="Buscar artículos, guías o soluciones..."
          className="w-full h-14 pl-12 pr-4 rounded-2xl border-2 border-slate-200 bg-white shadow-lg shadow-slate-200/50 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none text-slate-700 placeholder:text-slate-400"
        />
      </div>
    </div>
  );
}
