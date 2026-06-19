import React from 'react';
import type { ObjectKind } from '../../../core/world/objectKinds';

// Flat, color-coded SVG icons for the game objects. Authored in a 0..24 viewBox
// so the same glyph can be used both as a standalone <svg> (palette/buttons) and
// nested inside the maker board's <svg>.
export function objectGlyph(kind: ObjectKind): React.ReactNode {
  switch (kind) {
    case 'token':
      return (
        <>
          <circle cx="12" cy="12" r="9" fill="#fbbf24" stroke="#d97706" strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5.4" fill="none" stroke="#b45309" strokeWidth="1.2" opacity="0.7" />
        </>
      );
    case 'carrot':
      return (
        <>
          <path d="M12 22c-1.4 0-3.2-8.6-2.8-10.6l5.6 0C15.2 13.4 13.4 22 12 22z" fill="#f97316" stroke="#ea580c" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M12 11.4V6M12 11.4 9 7.4M12 11.4 15 7.4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case 'apple':
      return (
        <>
          <path d="M12 8.2C9.4 6.6 5 7 5 12c0 5 3.2 9 7 9s7-4 7-9c0-5-4.4-5.4-7-3.8z" fill="#ef4444" />
          <path d="M12 8.2V5.2" stroke="#78350f" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M12.2 6.4c1.6-1.8 4.2-1 3.4 1-1.4 1.4-3.4.6-3.4-1z" fill="#22c55e" />
        </>
      );
    case 'banana':
      return (
        <path d="M7 6c-1 7 4 12 10 12 2 0 3-1.6 3-2.8-5.6 1-9.4-2.6-10.6-8C9.2 5.6 8 5.4 7 6z" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" strokeLinejoin="round" />
      );
    case 'leaf':
      return (
        <>
          <path d="M12 3C7 6 5 13 7 20c6-1 12-7 10-14-1.4-1.6-3.4-2.6-5-3z" fill="#4ade80" stroke="#22c55e" strokeWidth="0.7" strokeLinejoin="round" />
          <path d="M9 18c2-6 5-10 7-12" stroke="#16a34a" strokeWidth="1" fill="none" strokeLinecap="round" />
        </>
      );
    case 'dandelion':
      return (
        <>
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const r = 4.6;
            const cx = 12 + r * Math.cos((a * Math.PI) / 180);
            const cy = 12 + r * Math.sin((a * Math.PI) / 180);
            return <circle key={a} cx={cx} cy={cy} r="3.2" fill="#fde047" />;
          })}
          <circle cx="12" cy="12" r="3.4" fill="#f59e0b" />
        </>
      );
  }
}

export function ObjectIcon({ kind, size = 24 }: { kind: ObjectKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {objectGlyph(kind)}
    </svg>
  );
}
