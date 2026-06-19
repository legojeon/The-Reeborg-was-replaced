import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useI18n } from '../i18n';

type Props = {
  status: string;
  kind: 'info' | 'running' | 'error';
  output?: string;
  // Short technical detail of a Python error (e.g. "NameError: ...")
  errorDetail?: string | null;
};

// Status strings that are internal signals, not text to print in the panel.
const INTERNAL = new Set(['Running...', 'success', 'fail', 'done']);

export function ResultPanel({ status, kind, output, errorDetail }: Props) {
  const { t } = useI18n();
  const statusText = kind === 'running' || INTERNAL.has(status) ? '' : status;
  const hasOutput = !!output && output.length > 0;
  const isError = kind === 'error';

  return (
    <div className="result-panel">
      <div className="result-head">
        <ClipboardList size={15} /> <span>{t('result.title')}</span>
      </div>
      <div className={`result-body${isError ? ' result-error' : ''}`}>
        {hasOutput && <div className="result-output">{output}</div>}
        {statusText && <div className={isError ? 'result-status-error' : 'result-status'}>{statusText}</div>}
        {isError && errorDetail && <div className="result-detail">{errorDetail}</div>}
        {!hasOutput && !statusText && <span className="result-placeholder">{t('result.placeholder')}</span>}
      </div>
    </div>
  );
}
