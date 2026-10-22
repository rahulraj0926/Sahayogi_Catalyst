'use client';

/** Quick-pick buttons plus a box to type any number. */
export function NumberPick({ value, onChange, presets, min, max, label, suffix, plural }: { value: number; onChange: (v: number) => void; presets: number[]; min: number; max: number; label: string; suffix?: string; plural?: boolean }) {
  const set = (v: number) => { if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v)))); };
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <div className="seg" role="group" aria-label={label}>{presets.map((v) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => set(v)}>{v}{suffix}{plural ? ` user${v === 1 ? '' : 's'}` : ''}</button>)}</div>
      <label className="small muted row" style={{ gap: 4 }}>or type <input type="number" min={min} max={max} value={value} aria-label={label} onChange={(e) => e.target.value !== '' && set(Number(e.target.value))} style={{ width: 70 }} />{suffix}</label>
    </div>
  );
}

