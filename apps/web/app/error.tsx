'use client';
import { useEffect } from 'react';
import { reportClientError, requestIdOf } from '@/lib/errors';

/** Shown when a screen crashes while drawing. The rest of the app (menu, header) stays. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); reportClientError(error, 'error-page'); }, [error]);
  const id = requestIdOf(error);
  return (
    <div className="card" role="alert" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h2>This screen hit a problem</h2>
      <p className="muted">Nothing you saved was lost. Try again, and if it keeps happening tell us what you were doing{id ? ' and quote the code below' : ''}.</p>
      {id && <p className="mono small">Code: {id}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={reset}>Try again</button>
        <a className="btn" href="/">Go to the home screen</a>
      </div>
    </div>
  );
}
