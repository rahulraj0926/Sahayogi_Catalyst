import { Suspense } from 'react';
import HomePage from '@/features/home/HomePage';
import { Loading } from '@/components/ui';

/** Home. Data comes from /api/v1/home/*; see features/home. The old portfolio page is replaced by this. */
export default function Page() {
  return <Suspense fallback={<Loading />}><HomePage /></Suspense>;
}
