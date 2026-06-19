import React from 'react';
import { Target, FlaskConical, CheckCircle2, Square } from 'lucide-react';
import type { GoalCheckItem } from '../../core/world/goal';
import { useI18n } from '../i18n';

interface Props {
  // HTML description from the world JSON (trusted local content).
  html?: string;
  // Whether this world defines a goal (mission) vs. free play.
  isMission?: boolean;
  // Per-condition goal checklist, shown after a run completes.
  checks?: GoalCheckItem[];
  showChecks?: boolean;
}

export function MissionPanel({ html, isMission = false, checks = [], showChecks = false }: Props) {
  const { t } = useI18n();
  const hasDesc = !!html && html.trim().length > 0;
  return (
    <div className="mission-panel">
      <div className="mission-header">
        <span className={`mission-tag ${isMission ? 'tag-mission' : 'tag-free'}`}>
          {isMission ? <Target size={13} /> : <FlaskConical size={13} />}
          {isMission ? t('mission.tag') : t('mission.free')}
        </span>
      </div>
      {hasDesc ? (
        <div className="mission-body" dangerouslySetInnerHTML={{ __html: html! }} />
      ) : (
        <div className="mission-body mission-empty">
          {isMission ? t('mission.missionEmpty') : t('mission.freeEmpty')}
        </div>
      )}
      {showChecks && checks.length > 0 && (
        <ul className="mission-checks">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? 'check-ok' : 'check-no'}>
              <span className="check-mark">{c.ok ? <CheckCircle2 size={15} /> : <Square size={15} />}</span>
              <span>{c.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
