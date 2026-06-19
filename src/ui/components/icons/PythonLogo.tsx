import React from 'react';

// The official two-tone Python logo (simplified, single-path-per-color).
export function PythonLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path
        fill="#3776AB"
        d="M54.6 0C27 0 28.7 12 28.7 12l.1 12.4h26.3v3.7H18.3S.6 25.9.6 53.8c0 27.9 15.4 26.9 15.4 26.9h9.2V67.8s-.5-15.4 15.1-15.4h26.1s14.6.2 14.6-14.1V14.3S83.2 0 54.6 0zM40.1 8.3c2.6 0 4.7 2.1 4.7 4.7s-2.1 4.7-4.7 4.7-4.7-2.1-4.7-4.7 2.1-4.7 4.7-4.7z"
      />
      <path
        fill="#FFD43B"
        d="M55.4 110c27.6 0 25.9-12 25.9-12l-.1-12.4H54.9v-3.7h36.8s17.7 2 17.7-25.9c0-27.9-15.4-26.9-15.4-26.9h-9.2v12.9s.5 15.4-15.1 15.4H43.6s-14.6-.2-14.6 14.1v23.9S26.8 110 55.4 110zM69.9 101.7c-2.6 0-4.7-2.1-4.7-4.7s2.1-4.7 4.7-4.7 4.7 2.1 4.7 4.7-2.1 4.7-4.7 4.7z"
      />
    </svg>
  );
}
