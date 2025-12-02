import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Colores de prioridad
    'bg-red-600',
    'bg-orange-600',
    'bg-yellow-500',
    'bg-green-600',
    'bg-gray-500',
    'text-white',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
