'use client';
import type { FeatureProps } from '../types';
import Overview from './Overview';
import Wizard from './Wizard';

/** Guided sessions: the short meetings that fill in phases 0-4. Prototype: work.js. /work = overview, /work/<code>?step=<id> = the wizard. */
export default function Work({ pid, args, query }: FeatureProps) {
  return args[0] ? <Wizard pid={pid} code={args[0]} step={query.get('step')} /> : <Overview pid={pid} />;
}
