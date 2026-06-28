import React from 'react';
import { useI18n } from '../i18n';

// Command reference shown in the help popup. Each entry pairs the literal Python
// command with an i18n key for its description.
const COMMANDS: Array<[string, string]> = [
  ['repeat n:', 'help.repeat'],
  ['move()', 'help.move'],
  ['turn_left()', 'help.turn_left'],
  ['take()', 'help.take'],
  ['put()', 'help.put'],
  ['build_wall()', 'help.build_wall'],
  ['done()', 'help.done'],
  ['think(ms)', 'help.think'],
  ['wall_in_front()', 'help.wall_in_front'],
  ['wall_on_right()', 'help.wall_on_right'],
  ['front_is_clear()', 'help.front_is_clear'],
  ['object_here()', 'help.object_here'],
  ['at_goal()', 'help.at_goal'],
  ['print(...)', 'help.print']
];

// A "?" button (bottom-right of the world) that opens a command reference popup.
export function HelpButton() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        className="help-fab"
        aria-label={t('help.aria')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >?</button>
      {open && (
        <div className="help-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-head">
              <span className="help-title">{t('help.title')}</span>
              <button className="help-close" aria-label={t('popup.ok')} onClick={() => setOpen(false)}>×</button>
            </div>
            <ul className="help-list">
              {COMMANDS.map(([cmd, key]) => (
                <li key={cmd}>
                  <code>{cmd}</code>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <div className="help-note">{t('help.note')}</div>
          </div>
        </div>
      )}
    </>
  );
}
