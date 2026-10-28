import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PitchIdea } from '@/components/landing/PitchIdea';

export const metadata: Metadata = { title: 'Pitch your idea · Sahayogi Catalyst' };

/** Where a new person starts: pitch an idea, then follow it to the CEO's decision. */
export default function Page() {
  return <Suspense fallback={null}><PitchIdea /></Suspense>;
}
