'use client';
import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors';

/** The last safety net: the page frame itself failed. It cannot use the app's styles, so it carries its own. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error, 'global-error'); }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <div role="alert" style={{ maxWidth: 480, padding: 24 }}>
          <h2>Sahayogi could not load</h2>
          <p>Something went wrong while opening the page. Try again; if it keeps happening, tell us what you were doing.</p>
          {error.digest && <p style={{ fontFamily: 'monospace', fontSize: 12 }}>Code: {error.digest}</p>}
          <button onClick={reset} style={{ padding: '8px 14px' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
