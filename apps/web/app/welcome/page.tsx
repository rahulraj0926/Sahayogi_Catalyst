import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';

export const metadata: Metadata = {
  title: 'Sahayogi Catalyst: from idea to proof',
  description: 'Catalyst takes a product from its first idea to launch in nine steps. The assistant drafts, people decide, every fact keeps its source.',
};

/** The front door: what Catalyst is, how it works, and where to go next (pitch an idea, or sign in). */
export default function Page() {
  return <Landing />;
}
