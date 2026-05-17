import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        kyujin: {
          bg: 'var(--kyujin-bg)',
          'bg-alt': 'var(--kyujin-bg-alt)',
          paper: 'var(--kyujin-paper)',
          pink: {
            50: 'var(--kyujin-pink-50)',
            100: 'var(--kyujin-pink-100)',
            200: 'var(--kyujin-pink-200)',
            300: 'var(--kyujin-pink-300)',
            400: 'var(--kyujin-pink-400)',
            500: 'var(--kyujin-pink-500)',
            600: 'var(--kyujin-pink-600)',
            700: 'var(--kyujin-pink-700)',
          },
          peach: 'var(--kyujin-peach)',
          'peach-deep': 'var(--kyujin-peach-deep)',
          cream: 'var(--kyujin-cream)',
          coral: 'var(--kyujin-coral)',
          'coral-deep': 'var(--kyujin-coral-deep)',
          mint: 'var(--kyujin-mint)',
          'mint-deep': 'var(--kyujin-mint-deep)',
          lilac: 'var(--kyujin-lilac)',
          'lilac-deep': 'var(--kyujin-lilac-deep)',
          butter: 'var(--kyujin-butter)',
          'butter-deep': 'var(--kyujin-butter-deep)',
          sand: 'var(--kyujin-sand)',
          ink: 'var(--kyujin-ink)',
          'ink-soft': 'var(--kyujin-ink-soft)',
          'ink-muted': 'var(--kyujin-ink-muted)',
          'ink-faint': 'var(--kyujin-ink-faint)',
          line: 'var(--kyujin-line)',
          'line-soft': 'var(--kyujin-line-soft)',
          'line-faint': 'var(--kyujin-line-faint)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        pillow: '28px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
