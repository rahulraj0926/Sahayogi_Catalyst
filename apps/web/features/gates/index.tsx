'use client';
/** Gates: stage sign-offs. /gates = what is blocking me (all stages). /gates/<n> = one stage in detail. Prototype: gates.js + gates_forms.js */
import type { FeatureProps } from '../types';
import Overview from './Overview';
import Stage from './Stage';

export default function Gates(props: FeatureProps) {
  const n = props.args[0];
  if (n !== undefined && /^\d+$/.test(n)) return <Stage {...props} n={Number(n)} />;
  return <Overview {...props} />;
}
