import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
      <h2>That page does not exist</h2>
      <p className="muted">The link may be old, or the product may have been archived.</p>
      <Link className="btn" href="/">Go to the home screen</Link>
    </div>
  );
}
