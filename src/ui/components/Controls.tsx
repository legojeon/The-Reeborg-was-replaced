import React from 'react';
import { Play, Square, SkipBack, SkipForward, RotateCcw, Lightbulb } from 'lucide-react';
import { useI18n, LangToggle } from '../i18n';

export interface WorldOption {
  id: string;
  name: string;
  path?: string;
  custom?: boolean;
}

interface Props {
  onRun: () => void | Promise<void>;
  onStop?: () => void;
  onPrev: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onReset: () => void | Promise<void>;
  disabled?: boolean;
  running?: boolean;
  worlds?: WorldOption[];
  selectedWorldId?: string | null;
  onSelectWorld?: (id: string | null) => void;
  // Cleared world ids — used to mark solved missions in the dropdown
  cleared?: Set<string>;
  // "답 보기" — only enabled when the current world has a solution
  hasSolution?: boolean;
  onShowSolution?: () => void;
}

export function Controls({
  onRun, onStop, onPrev, onNext, onReset, disabled, running,
  worlds = [], selectedWorldId = null, onSelectWorld,
  cleared, hasSolution, onShowSolution
}: Props) {
  const { t } = useI18n();

  return (
    <div className="controls">
      <div className="controls-toolbar">
        {running ? (
          <button className="btn btn-stop btn-run" onClick={onStop} aria-label={t('ctrl.stop')}>
            <Square size={15} fill="currentColor" /> {t('ctrl.stop')}
          </button>
        ) : (
          <button className="btn btn-primary btn-run" onClick={onRun} disabled={!!disabled} aria-label={t('ctrl.run')}>
            <Play size={15} fill="currentColor" /> {t('ctrl.run')}
          </button>
        )}
        <div className="btn-group" role="group" aria-label="step">
          <button className="btn" onClick={onPrev} disabled={!!disabled} aria-label={t('ctrl.prev')}><SkipBack size={15} /> {t('ctrl.prev')}</button>
          <button className="btn" onClick={onNext} disabled={!!disabled} aria-label={t('ctrl.next')}><SkipForward size={15} /> {t('ctrl.next')}</button>
          <button className="btn" onClick={onReset} disabled={!!disabled} aria-label={t('ctrl.reset')}><RotateCcw size={15} /> {t('ctrl.reset')}</button>
        </div>
        {hasSolution && (
          <button className="btn btn-ghost" onClick={onShowSolution} disabled={!!disabled} aria-label={t('ctrl.solution')}><Lightbulb size={15} /> {t('ctrl.solution')}</button>
        )}
        <LangToggle />
      </div>
      <div className="world-select">
        <span className="world-label">{t('ctrl.world')}</span>
        <select
          aria-label={t('ctrl.world')}
          value={selectedWorldId ?? ''}
          onChange={(e) => onSelectWorld?.(e.target.value || null)}
        >
          <option value="">{t('ctrl.defaultWorld')}</option>
          {worlds.map(w => (
            <option key={w.id} value={w.id}>
              {cleared?.has(w.id) ? '✓ ' : ''}{w.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
