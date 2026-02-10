// src/components/Header.tsx
'use client';

import { useState, useEffect } from 'react';
import { Headset } from 'lucide-react';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export function Header() {
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  return (
    <header className="bg-gradient-to-r from-[#00549B] to-[#0070CC] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Headset className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Mesa de Ayuda TI</h1>
              <p className="text-blue-200 text-sm">Plan Automotor</p>
            </div>
          </div>
        </div>

        {greeting && (
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl font-bold">{greeting}</p>
            <p className="text-blue-200 mt-1">¿En qué podemos ayudarte hoy?</p>
          </div>
        )}
      </div>
    </header>
  );
}
