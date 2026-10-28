import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InnovationCase } from '@/components/landing/InnovationCase';

export const metadata: Metadata = { title: 'Innovation · Sahayogi Catalyst' };

/** The Innovation step of one idea: the problem, who it is for, and real rivals, before the idea goes to the CEO. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={null}><InnovationCase id={decodeURIComponent(id)} /></Suspense>;
}
