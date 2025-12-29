import React from 'react';

export function ConsolePanel() {
  return (
    <div style={{ padding: 12, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 8, minHeight: 0 }}>
      <strong>Console</strong>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        padding: 8,
        overflow: 'auto',
        minHeight: 120
      }}>
        Ready. Showing grid and robot preview.
      </div>
    </div>
  );
}


