import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FilePlus2, Upload, Download, X, Eye, Layers, Boxes } from 'lucide-react';
import { useI18n, LangToggle } from '../i18n';
import {
  listCustomWorlds, deleteCustomWorld, saveCustomWorld, uniqueWorldId, worldVariantCount,
  getHiddenBuiltins, hideBuiltin, type CustomWorldRecord
} from '../customWorlds';
import { normalizeWorld } from '../../core/world/loader';
import { kindLabel } from '../../core/world/goal';
import type { World } from '../../core/types/types';
import { MiniWorld } from './MiniWorld';

type Row =
  | { kind: 'custom'; id: string; name: string; data: any; updatedAt: number; mission: boolean }
  | { kind: 'builtin'; id: string; name: string; path: string; mission: boolean };

// A world is a "mission" if it defines a goal; otherwise it's free play.
function detectMission(data: any): boolean {
  try { return !!normalizeWorld(data).goal; } catch { return false; }
}

// Strip HTML tags from a description for plain-text display in the info table.
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function WorldManager() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [customs, setCustoms] = React.useState<CustomWorldRecord[]>(() => listCustomWorlds());
  const [builtins, setBuiltins] = React.useState<Array<{ id: string; name: string; path: string; mission?: boolean }>>([]);
  const [hidden, setHidden] = React.useState<string[]>(() => getHiddenBuiltins());
  const [msg, setMsg] = React.useState<string>('');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<World | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    fetch('/worlds/index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (Array.isArray(d?.worlds)) setBuiltins(d.worlds); })
      .catch(() => setBuiltins([]));
  }, []);

  const rows: Row[] = [
    ...customs.map(w => ({ kind: 'custom' as const, id: w.id, name: w.name, data: w.data, updatedAt: w.updatedAt, mission: detectMission(w.data) })),
    ...builtins.filter(b => !hidden.includes(b.id)).map(b => ({ kind: 'builtin' as const, id: b.id, name: b.name, path: b.path, mission: !!b.mission }))
  ];

  async function togglePreview(row: Row) {
    const key = `${row.kind}:${row.id}`;
    if (openId === key) { setOpenId(null); setPreview(null); return; }
    setOpenId(key);
    setPreview(null);
    try {
      const data = row.kind === 'custom' ? row.data : await (await fetch(row.path)).json();
      setPreview(normalizeWorld(data));
    } catch {
      setPreview(null);
    }
  }

  function download(name: string, data: any) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'world'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  async function exportRow(row: Row) {
    if (row.kind === 'custom') return download(row.name, row.data);
    try { download(row.name, await (await fetch(row.path)).json()); }
    catch { setMsg(t('worlds.importSome', { ok: 0, fail: 1 })); }
  }

  function removeRow(row: Row) {
    if (!window.confirm(t('worlds.deleteConfirm', { name: row.name }))) return;
    if (openId === `${row.kind}:${row.id}`) { setOpenId(null); setPreview(null); }
    if (row.kind === 'custom') { deleteCustomWorld(row.id); setCustoms(listCustomWorlds()); }
    else { hideBuiltin(row.id); setHidden(getHiddenBuiltins()); }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    let ok = 0, fail = 0, remaining = files.length;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          normalizeWorld(data);
          const name = (typeof data?.name === 'string' && data.name.trim()) || file.name.replace(/\.json$/i, '');
          saveCustomWorld({ id: uniqueWorldId(name), name, data });
          ok++;
        } catch { fail++; }
        if (--remaining === 0) {
          setCustoms(listCustomWorlds());
          setMsg(fail > 0 ? t('worlds.importSome', { ok, fail }) : t('worlds.importOk', { n: ok }));
        }
      };
      reader.readAsText(file);
    });
  }

  // Label/value summary of a world for the info table beside the preview.
  function worldInfo(w: World, variants: number): Array<[string, string]> {
    const dirWord = (lang === 'ko' ? { N: '북', E: '동', S: '남', W: '서' } : { N: 'N', E: 'E', S: 'S', W: 'W' })[w.robot.dir];
    const agg: Record<string, number> = {};
    for (const o of w.objects ?? []) if (o.count > 0) agg[o.kind] = (agg[o.kind] ?? 0) + o.count;
    const objStr = Object.entries(agg).map(([k, n]) => `${kindLabel(k, lang)} ${n}`).join(', ') || '–';
    const g: any = w.goal ?? {};
    const goalParts: string[] = [];
    if (g.objects && Object.keys(g.objects).length) goalParts.push(t('info.goalObjects', { n: Object.keys(g.objects).length }));
    if (g.position) goalParts.push(t('info.goalPos', { x: Math.floor(g.position.x), y: Math.floor(g.position.y) }));
    if (Array.isArray(g.possible_final_positions) && g.possible_final_positions.length) goalParts.push(t('info.goalFinish', { n: g.possible_final_positions.length }));
    if (g.walls && Object.keys(g.walls).length) goalParts.push(t('info.goalWalls'));
    const desc = stripHtml(typeof w.description === 'string' ? w.description : '');
    const r: Array<[string, string]> = [
      [t('info.type'), w.goal ? t('worlds.mission') : t('worlds.free')]
    ];
    if (desc) r.push([t('info.desc'), desc]);
    r.push(
      [t('info.size'), `${w.height} × ${w.width}`],
      [t('info.robot'), `(${w.robot.x}, ${w.robot.y}) ${dirWord}`],
      [t('info.objects'), objStr],
      [t('info.walls'), String(w.walls.length)],
      [t('info.goal'), w.goal ? (goalParts.join(', ') || '–') : '–']
    );
    if (variants > 1) r.push([t('info.variants'), String(variants)]);
    return r;
  }

  return (
    <div className="wm-root">
      <div className="page-header">
        <div className="ph-left" />
        <span className="ph-title"><Boxes size={18} /> {t('worlds.title')}</span>
        <div className="ph-right">
          <LangToggle />
          <button className="btn" onClick={() => navigate('/')}><ArrowLeft size={15} /> {t('worlds.back')}</button>
        </div>
      </div>
      <div className="page-toolbar center">
        <button className="btn btn-primary" onClick={() => navigate('/maker')}><FilePlus2 size={15} /> {t('worlds.new')}</button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> {t('worlds.import')}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={onPickFile} />
      </div>
      {msg && <div className="wm-msg">{msg}</div>}

      <div className="wm-body">
        {rows.length === 0 ? (
          <div className="wm-empty">{t('worlds.empty')}</div>
        ) : (
          <ul className="wm-list">
            {rows.map((row) => {
              const key = `${row.kind}:${row.id}`;
              const variants = row.kind === 'custom' ? worldVariantCount(row.data) : 1;
              const open = openId === key;
              return (
                <li key={key} className="wm-item">
                  <div className="wm-card">
                    <div className="wm-card-main">
                      <span className={`wm-tag ${row.mission ? 'mission' : 'free'}`}>{row.mission ? t('worlds.mission') : t('worlds.free')}</span>
                      <span className="wm-card-name">{row.name || row.id}</span>
                      {(variants > 1 || row.kind === 'custom') && (
                        <span className="wm-card-meta">
                          {variants > 1 && <span className="wm-badge"><Layers size={11} /> {t('worlds.variants', { n: variants })}</span>}
                          {row.kind === 'custom' && <span className="wm-date">{new Date(row.updatedAt).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US')}</span>}
                        </span>
                      )}
                    </div>
                    <div className="wm-card-actions">
                      <button className={`wm-icon-btn${open ? ' active' : ''}`} title={t('worlds.preview')} aria-label={t('worlds.preview')} onClick={() => togglePreview(row)}><Eye size={15} /></button>
                      <button className="wm-icon-btn" title={t('worlds.export')} aria-label={t('worlds.export')} onClick={() => exportRow(row)}><Download size={15} /></button>
                      <button className="wm-icon-btn wm-del" title={t('worlds.delete')} aria-label={t('worlds.delete')} onClick={() => removeRow(row)}><X size={15} /></button>
                    </div>
                  </div>
                  {open && (
                    <div className="wm-preview">
                      {preview ? (
                        <>
                          <div className="wm-preview-map"><MiniWorld world={preview} /></div>
                          <table className="wm-info">
                            <tbody>
                              {worldInfo(preview, variants).map(([k, val]) => (
                                <tr key={k}><th>{k}</th><td>{val}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : <span className="wm-preview-loading">…</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
