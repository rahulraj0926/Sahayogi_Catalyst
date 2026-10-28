import Link from 'next/link';

/** The logo and name, linking to the landing page. */
export function Brand({ href = '/welcome' }: { href?: string }) {
  return (
    <Link href={href} aria-label="Sahayogi Catalyst home" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap no-underline hover:no-underline">
      <img src="/logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
      <span className="text-[1.0625rem] font-semibold tracking-tight text-[var(--text-heading)]">Sahayogi Catalyst</span>
    </Link>
  );
}
