'use client';
import { Badge } from '@/components/ui';

export default function CriteriaList({ results, actions }: { results: any[]; actions?: (r: any) => React.ReactNode }) {
  return (
    <div>
      {results.map((r) => (
        <div className="crit" key={r.id}>
          <span className="mono xs muted">{r.id}</span>
          <div><div>{r.text}</div><div className="msg">{r.message}</div></div>
          <span className="row">
            {actions?.(r)}
            {r.severity === 'must' && <Badge kind="outline">must</Badge>}
            <Badge kind={r.status === 'PASS' ? 'ok' : r.status === 'FAIL' ? 'bad' : r.status === 'NA' ? '' : 'warn'}>
              {r.status === 'ATTEST_PENDING' ? 'needs sign-off' : r.status === 'NA' ? 'not checked' : r.status.toLowerCase()}
            </Badge>
          </span>
        </div>
      ))}
    </div>
  );
}
