'use client';
import { Page } from '@/components/ui';

/** API reference: the backend's own Swagger UI (/api/docs), shown inside the app. The web server forwards /api/* to the API, so it is the same page, always current. */
export default function ApiDocsPage() {
  return (
    <Page
      title="API reference"
      sub="Every route the server has. The /api/v1 routes are typed; the older /api routes are listed too and marked deprecated. Use Authorize to set X-Actor, then Try it out."
      right={<a className="btn" href="/api/docs" target="_blank" rel="noreferrer">Open in a new tab</a>}
    >
      <iframe title="Swagger UI" src="/api/docs" style={{ width: '100%', height: 'calc(100vh - 190px)', minHeight: 480, border: '1px solid var(--border, #ddd)', borderRadius: 8, background: '#fff' }} />
    </Page>
  );
}
