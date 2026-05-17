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
        yume: {
          bg: 'var(--yume-bg)',
          'bg-alt': 'var(--yume-bg-alt)',
          paper: 'var(--yume-paper)',
          pink: {
            50: 'var(--yume-pink-50)',
            100: 'var(--yume-pink-100)',
            200: 'var(--yume-pink-200)',
            300: 'var(--yume-pink-300)',
            400: 'var(--yume-pink-400)',
            500: 'var(--yume-pink-500)',
            600: 'var(--yume-pink-600)',
            700: 'var(--yume-pink-700)',
          },
          peach: 'var(--yume-peach)',
          'peach-deep': 'var(--yume-peach-deep)',
          cream: 'var(--yume-cream)',
          coral: 'var(--yume-coral)',
          'coral-deep': 'var(--yume-coral-deep)',
          mint: 'var(--yume-mint)',
          'mint-deep': 'var(--yume-mint-deep)',
          lilac: 'var(--yume-lilac)',
          'lilac-deep': 'var(--yume-lilac-deep)',
          butter: 'var(--yume-butter)',
          'butter-deep': 'var(--yume-butter-deep)',
          sand: 'var(--yume-sand)',
          ink: 'var(--yume-ink)',
          'ink-soft': 'var(--yume-ink-soft)',
          'ink-muted': 'var(--yume-ink-muted)',
          'ink-faint': 'var(--yume-ink-faint)',
          line: 'var(--yume-line)',
          'line-soft': 'var(--yume-line-soft)',
          'line-faint': 'var(--yume-line-faint)',
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
