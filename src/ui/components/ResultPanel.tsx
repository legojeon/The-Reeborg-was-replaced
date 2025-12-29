import React from 'react';

type Props = {
  status: string;
  kind: 'info' | 'running' | 'error';
};

export function ResultPanel({ status, kind }: Props) {
  return (
    <div style={{ margin: '0 12px 12px 12px', minHeight: 0, minWidth: 0 }}>
      <div
        style={{
          padding: 10,
          border: `1px solid ${kind === 'error' ? '#fecaca' : '#e5e7eb'}`,
          borderRadius: 6,
          background: `${kind === 'error' ? '#fee2e2' : '#ffffff'}`,
          color: '#111827',
          overflow: 'auto',
          width: '100%',
          maxWidth: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          boxSizing: 'border-box',
          height: '100%'
        }}
      >
        {status}
      </div>
    </div>
  );
}


