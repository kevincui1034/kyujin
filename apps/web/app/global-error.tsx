'use client';

// Last-resort error boundary. Fires when the root layout itself throws —
// at that point Next.js can't render any of our normal chrome, so this
// file MUST include its own <html> and <body>. No PillowCard, no nav,
// just a plain-styled escape hatch.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fffaf9',
          color: '#1a0e12',
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went very wrong</h1>
          <p style={{ fontSize: 14, color: '#6b5158', marginBottom: 20 }}>
            We couldn't render the page. Refresh to try again — if it keeps happening, let us
            know at support@yumeai.app.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: '#a89098', marginBottom: 20 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#e85a7a',
              color: 'white',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
