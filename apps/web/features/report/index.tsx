'use client';
import type { FeatureProps } from '../types';
import ProductReport from './ProductReport';

/** /products/:pid/report. The portfolio-wide report lives at /reports (app/reports/page.tsx). */
export default function Report({ pid }: FeatureProps) { return <ProductReport pid={pid} />; }
