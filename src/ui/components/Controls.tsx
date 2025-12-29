import React from 'react';

interface Props {
  onRun: () => void | Promise<void>;
  onPrev: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
  disabled?: boolean;
  worlds?: Array<{ id: string; name: string; path: string }>;
  selectedWorldId?: string | null;
  onSelectWorld?: (id: string | null) => void;
}

export function Controls({ onRun, onPrev, onNext, onReset, disabled, worlds = [], selectedWorldId = null, onSelectWorld }: Props) {
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <strong>Controls</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onRun} disabled={!!disabled}>Run (enqueue)</button>
        <button onClick={onPrev} disabled={!!disabled}>Prev</button>
        <button onClick={onNext} disabled={!!disabled}>Next</button>
        <button onClick={onReset} disabled={!!disabled}>Reset</button>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6}}>
          <select
            value={selectedWorldId ?? ''}
            onChange={(e) => onSelectWorld?.(e.target.value || null)}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '6px 8px',
              background: '#ffffff',
              color: '#111827'
            }}
          >
            <option value="">Default</option>
            {worlds.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}


