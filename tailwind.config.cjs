/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          'sans-serif'
        ]
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
        'xs':  ['12px', { lineHeight: '16px' }],
        'sm':  ['13px', { lineHeight: '18px' }],
        'base':['14px', { lineHeight: '20px' }],
        'lg':  ['16px', { lineHeight: '22px' }],
        'xl':  ['18px', { lineHeight: '24px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['28px', { lineHeight: '32px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
        '5xl': ['48px', { lineHeight: '52px' }]
      },
      colors: {
        // Linear/Amie-inspired neutrals
        ink: {
          50:  '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
          950: '#0B0B0E'
        },
        accent: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA'
        }
      },
      borderRadius: {
        'xl':  '14px',
        '2xl': '18px',
        '3xl': '24px'
      },
      boxShadow: {
        'glass':  '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
        'glass-lg':'0 1px 2px rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.10)',
        'glass-dark': '0 1px 2px rgba(0,0,0,0.3), 0 8px 32px rgba(0,0,0,0.4)'
      },
      backdropBlur: {
        xs: '4px'
      }
    }
  },
  plugins: []
}
