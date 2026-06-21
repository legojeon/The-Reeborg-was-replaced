import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BrickWall, RotateCw, Eraser, Flag, Ban, Target, Save, CheckCircle2, FilePlus2, Trash2,
  Download, ArrowLeft, Dices, BookOpen, Lightbulb, Wrench, Bot, Copy, X, Loader2, XCircle,
  ZoomIn, ZoomOut
} from 'lucide-react';
import type { Direction } from '../../core/types/types';
import type { ObjectKind } from '../../core/world/objectKinds';
import type { TileKind } from '../../core/world/tileKinds';
import { ObjectIcon, objectGlyph } from '../components/icons/ObjectIcon';
import {
  MakerState, ObjVal, createEmptyMaker, createEmptyVariant, activeVariant, updateActive, addVariant, removeVariant, duplicateVariant,
  canonicalWall, toggleWall, pruneToBounds,
  setObject, removeObject, addObject, setGoalObject, removeGoalObject, addGoalObject, toggleGoalEmpty,
  clearCell, makerToV2, worldDataToMaker
} from './makerModel';
import { saveCustomWorld, getCustomWorld, deleteCustomWorld, listCustomWorlds } from '../customWorlds';
import { useI18n, LangToggle } from '../i18n';
import { renderMarkdown } from '../markdown';
import { reasonToMessage } from '../messages';
import { parsePythonError } from '../pythonErrors';
import { validateSolution, type SolutionCheck, type SolutionReport } from './validateSolution';

const CELL = 54;
const PAD = 16;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.2;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

const OBJECT_KINDS: ObjectKind[] = ['token', 'carrot', 'apple', 'banana', 'leaf', 'dandelion'];
const TILE_KINDS: TileKind[] = ['grass', 'pale_grass', 'ice', 'mud', 'water', 'gravel', 'bricks'];
const TILE_COLOR: Record<TileKind, string> = {
  grass: '#86efac', pale_grass: '#d9f99d', ice: '#bae6fd', mud: '#b08968',
  water: '#60a5fa', gravel: '#d1d5db', bricks: '#f0a868'
};
const DIR_ARROW: Record<Direction, string> = { N: '▲', E: '▶', S: '▼', W: '◀' };

// Tools are encoded as strings so each object/tile kind is its own selectable
// tool — picking the carrot block IS selecting the "place carrot" tool.
type Tool =
  | 'wall' | 'robot' | 'goalPos' | 'goalWall' | 'goalEmpty' | 'erase'
  | `obj:${ObjectKind}` | `goalObj:${ObjectKind}` | `tile:${TileKind}`;

export default function MapMaker() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const editId = (params.id as string | undefined) ?? null;

  const [state, setState] = React.useState<MakerState>(() => createEmptyMaker());
  const [tool, setTool] = React.useState<Tool>('wall');
  // Board zoom factor (1 = 100%). Scales the SVG only; grid coordinates stay the same.
  const [zoom, setZoom] = React.useState<number>(1);
  // Store the i18n key (not the translated text) so the message follows the language.
  const [savedMsg, setSavedMsg] = React.useState<string>('');
  // Live-rendered preview of the Markdown mission description.
  const descPreview = React.useMemo(() => renderMarkdown(state.description), [state.description]);
  // Solution-check state: null = not run, [] while we wait on the first run.
  const [checking, setChecking] = React.useState<boolean>(false);
  const [checkReport, setCheckReport] = React.useState<SolutionReport | null>(null);

  // Context-bar options for object placement / goals
  const [count, setCount] = React.useState<number>(1);
  const [random, setRandom] = React.useState<boolean>(false);
  const [rmin, setRmin] = React.useState<number>(1);
  const [rmax, setRmax] = React.useState<number>(3);
  const [goalAll, setGoalAll] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!editId) return;
    const rec = getCustomWorld(editId);
    if (rec) setState(worldDataToMaker(rec.data, rec.name));
  }, [editId]);

  const v = activeVariant(state);
  const { rows, cols } = v;
  const boardW = cols * CELL + PAD * 2;
  const boardH = rows * CELL + PAD * 2;

  const cellLeft = (x: number) => PAD + (x - 1) * CELL;
  const cellTop = (y: number) => PAD + (rows - y) * CELL;

  const placeVal = (): ObjVal => (random ? { min: Math.min(rmin, rmax), max: Math.max(rmin, rmax) } : Math.max(1, count));

  function handleCellClick(x: number, y: number, e: React.MouseEvent) {
    const coord = `${x},${y}`;
    const remove = e.shiftKey || e.button === 2;
    setSavedMsg('');
    if (tool === 'robot') {
      setState(s => updateActive(s, vr => ({ ...vr, robot: { ...vr.robot, x, y } })));
    } else if (tool === 'goalPos') {
      // Setting one finish cell clears any preserved multi-finish candidates.
      setState(s => updateActive(s, vr => remove
        ? { ...vr, goalPosition: null }
        : { ...vr, goalPosition: { x, y }, goalFinalPositions: [] }));
    } else if (tool === 'goalEmpty') {
      setState(s => updateActive(s, vr => toggleGoalEmpty(vr, coord)));
    } else if (tool === 'erase') {
      setState(s => updateActive(s, vr => clearCell(vr, coord)));
    } else if (tool.startsWith('obj:')) {
      const kind = tool.slice(4) as ObjectKind;
      setState(s => updateActive(s, vr => {
        // Random uses a fixed range (replace); otherwise each click stacks `count`.
        if (random) return remove ? removeObject(vr, coord, kind) : setObject(vr, coord, kind, placeVal());
        return addObject(vr, coord, kind, (remove ? -1 : 1) * Math.max(1, count));
      }));
    } else if (tool.startsWith('goalObj:')) {
      const kind = tool.slice(8) as ObjectKind;
      setState(s => updateActive(s, vr => {
        if (goalAll) return remove ? removeGoalObject(vr, coord, kind) : setGoalObject(vr, coord, kind, 'all');
        return addGoalObject(vr, coord, kind, (remove ? -1 : 1) * Math.max(1, count));
      }));
    } else if (tool.startsWith('tile:')) {
      const kind = tool.slice(5) as TileKind;
      setState(s => updateActive(s, vr => {
        const tiles = { ...vr.tiles };
        if (remove) delete tiles[coord];
        else tiles[coord] = kind;
        return { ...vr, tiles };
      }));
    }
  }

  function handleEdgeClick(x: number, y: number, dir: Direction) {
    setSavedMsg('');
    const key = canonicalWall(x, y, dir);
    if (tool === 'goalWall') setState(s => updateActive(s, vr => ({ ...vr, goalWalls: toggleWall(vr.goalWalls, key) })));
    else setState(s => updateActive(s, vr => ({ ...vr, walls: toggleWall(vr.walls, key) })));
  }

  function rotateRobot() {
    const order: Direction[] = ['E', 'N', 'W', 'S'];
    setState(s => updateActive(s, vr => ({ ...vr, robot: { ...vr.robot, dir: order[(order.indexOf(vr.robot.dir) + 1) % 4] } })));
  }

  function doSave() {
    const name = state.name.trim();
    if (!name) { setSavedMsg('mk.nameRequired'); return; }
    const id = editId ?? uniqueId(slugify(name));
    const data = makerToV2({ ...state, name });
    if (!saveCustomWorld({ id, name, data })) {
      setSavedMsg('mk.saveFail');
      return;
    }
    setSavedMsg('mk.saved');
    if (!editId) navigate(`/maker/${encodeURIComponent(id)}`, { replace: true });
  }

  // Run the solution code headlessly against every variant and report whether
  // each one reaches its goal — lets the author confirm the puzzle is solvable.
  async function doValidate() {
    if (checking) return;
    setSavedMsg('');
    if (!state.solution.trim()) { setCheckReport(null); setSavedMsg('mk.solEmpty'); return; }
    setChecking(true);
    setCheckReport(null);
    try {
      const report = await validateSolution(state, lang);
      setCheckReport(report);
    } catch (err) {
      setCheckReport({ ok: false, checks: [{ variant: 0, status: 'pyError', goalItems: [], pyRaw: (err as any)?.message ?? String(err) }] });
    } finally {
      setChecking(false);
    }
  }

  function doDelete() {
    if (!editId) return;
    if (!window.confirm(t('mk.deleteConfirm'))) return;
    deleteCustomWorld(editId);
    navigate('/');
  }

  function doNew() {
    if (!window.confirm(t('mk.newConfirm'))) return;
    setState(createEmptyMaker());
    setSavedMsg('');
    setTool('wall');
    if (editId) navigate('/maker'); // drop the edit id so Save creates a fresh world
  }

  function doClear() {
    if (!window.confirm(t('mk.clearConfirm'))) return;
    setSavedMsg('');
    setState(s => updateActive(s, vr => createEmptyVariant(vr.rows, vr.cols)));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(makerToV2(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.name || 'world').trim()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resize(nextRows: number, nextCols: number) {
    const r = Math.max(1, Math.min(20, nextRows));
    const c = Math.max(1, Math.min(20, nextCols));
    setState(s => updateActive(s, vr => pruneToBounds(
      { ...vr, rows: r, cols: c, robot: { ...vr.robot, x: Math.min(vr.robot.x, c), y: Math.min(vr.robot.y, r) } },
      r, c
    )));
  }

  const isWallEdge = tool === 'wall' || tool === 'goalWall';

  return (
    <div className="maker-root">
      <div className="page-header">
        <div className="ph-left" />
        <span className="ph-title"><Wrench size={18} /> {t('mk.title')}</span>
        <div className="ph-right">
          <LangToggle />
          <button className="btn" onClick={() => navigate('/')}><ArrowLeft size={15} /> {t('mk.back')}</button>
        </div>
      </div>

      <div className="maker-main">
        {/* Tool palette */}
        <div className="maker-palette">
          <Section title={t('mk.secDraw')}>
            <div className="tool-grid">
              <ToolCard active={tool === 'wall'} onClick={() => setTool('wall')} icon={<BrickWall size={22} />} label={t('mk.wall')} hint={t('mk.wallHint')} />
              <ToolCard active={tool === 'robot'} onClick={() => setTool('robot')} icon={<Bot size={22} />} label={t('mk.robot')} hint={t('mk.robotHint')} />
              <ToolCard active={false} onClick={rotateRobot} icon={<RotateCw size={22} />} label={t('mk.dir')} hint={t('mk.dirHint')} />
              <ToolCard active={tool === 'erase'} onClick={() => setTool('erase')} icon={<Eraser size={22} />} label={t('mk.erase')} hint={t('mk.eraseHint')} />
            </div>
          </Section>

          <Section title={t('mk.secTiles')}>
            <div className="tool-grid">
              {TILE_KINDS.map(tk => (
                <button key={tk} className={`tool-card${tool === `tile:${tk}` ? ' active' : ''}`} onClick={() => setTool(`tile:${tk}`)}>
                  <span className="tool-swatch" style={{ background: TILE_COLOR[tk] }} />
                  <span className="tool-card-label">{t(`tile.${tk}`)}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('mk.secPlace')}>
            <div className="tool-grid">
              {OBJECT_KINDS.map(k => (
                <button key={k} className={`tool-card${tool === `obj:${k}` ? ' active' : ''}`} onClick={() => setTool(`obj:${k}`)}>
                  <span className="tool-emoji"><ObjectIcon kind={k} size={24} /></span>
                  <span className="tool-card-label">{t(`kind.${k}`)}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('mk.secGoal')}>
            <div className="tool-grid">
              {OBJECT_KINDS.map(k => (
                <button key={k} className={`tool-card goal${tool === `goalObj:${k}` ? ' active' : ''}`} onClick={() => setTool(`goalObj:${k}`)}>
                  <span className="tool-emoji goal-emoji"><ObjectIcon kind={k} size={24} /><Target className="goal-badge" size={12} /></span>
                  <span className="tool-card-label">{t(`kind.${k}`)}</span>
                </button>
              ))}
            </div>
            <div className="tool-grid cols-3" style={{ marginTop: 8 }}>
              <button className={`tool-card goal${tool === 'goalPos' ? ' active' : ''}`} onClick={() => setTool('goalPos')}>
                <span className="tool-emoji"><Flag size={22} /></span><span className="tool-card-label">{t('mk.arrive')}</span>
              </button>
              <button className={`tool-card goal${tool === 'goalWall' ? ' active' : ''}`} onClick={() => setTool('goalWall')}>
                <span className="tool-emoji"><BrickWall size={22} /></span><span className="tool-card-label">{t('mk.goalWall')}</span>
              </button>
              <button className={`tool-card goal${tool === 'goalEmpty' ? ' active' : ''}`} onClick={() => setTool('goalEmpty')}>
                <span className="tool-emoji"><Ban size={22} /></span><span className="tool-card-label">{t('mk.empty')}</span>
              </button>
            </div>
          </Section>

          <Section title={t('mk.secSettings')}>
            <label className="maker-field">{t('mk.rows')}<input type="number" min={1} max={20} value={rows} onChange={e => resize(parseInt(e.target.value || '1', 10), cols)} /></label>
            <label className="maker-field">{t('mk.cols')}<input type="number" min={1} max={20} value={cols} onChange={e => resize(rows, parseInt(e.target.value || '1', 10))} /></label>
            <label className="maker-field">{t('mk.tokens')}<input type="number" min={0} value={v.robotTokens} onChange={e => { const n = Math.max(0, parseInt(e.target.value || '0', 10)); setState(s => updateActive(s, vr => ({ ...vr, robotTokens: n }))); }} /></label>
          </Section>
        </div>

        {/* Center: variant tabs + context bar + board */}
        <div className="maker-center">
          <div className="variant-tabs">
            <span className="variant-tabs-label">{t('mk.variants')}</span>
            {state.variants.map((_, i) => (
              <span key={i} className={`variant-tab${i === state.active ? ' active' : ''}`}>
                <button className="variant-tab-btn" onClick={() => setState(s => ({ ...s, active: i }))}>{t('mk.variant', { n: i + 1 })}</button>
                <button className="variant-tab-icon" title={t('mk.duplicateVariant')} aria-label={t('mk.duplicateVariant')} onClick={() => setState(s => duplicateVariant(s, i))}><Copy size={13} /></button>
                {state.variants.length > 1 && (
                  <button className="variant-tab-icon variant-tab-x" title={t('mk.deleteVariant')} aria-label={t('mk.deleteVariant')} onClick={() => setState(s => removeVariant(s, i))}><X size={14} /></button>
                )}
              </span>
            ))}
            <button className="variant-add" onClick={() => setState(s => addVariant(s))}>{t('mk.addVariant')}</button>
            {state.variants.length > 1 && <span className="variant-hint"><Dices size={14} /> {t('mk.variantHint')}</span>}
          </div>
          <ContextBar
            tool={tool}
            count={count} setCount={setCount}
            random={random} setRandom={setRandom}
            rmin={rmin} setRmin={setRmin} rmax={rmax} setRmax={setRmax}
            goalAll={goalAll} setGoalAll={setGoalAll}
          />
          <div className="maker-board-wrap">
            <div className="maker-board-inner">
              <svg width={boardW * zoom} height={boardH * zoom} viewBox={`0 0 ${boardW} ${boardH}`} onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none', display: 'block' }}>
                {/* cells + tiles */}
                {range(rows).flatMap(ry => range(cols).map(cx => {
                  const x = cx + 1, y = ry + 1;
                  const coord = `${x},${y}`;
                  const tile = v.tiles[coord];
                  return (
                    <rect key={`c-${coord}`} x={cellLeft(x)} y={cellTop(y)} width={CELL} height={CELL}
                      fill={tile ? TILE_COLOR[tile] : '#ffffff'} stroke="#e5e7eb"
                      onClick={(e) => handleCellClick(x, y, e)}
                      onMouseDown={(e) => { if (e.button === 2) handleCellClick(x, y, e); }}
                      style={{ cursor: 'pointer' }} />
                  );
                }))}

                {/* goal: empty-cell markers */}
                {v.goalEmptyCells.map(coord => {
                  const [x, y] = coord.split(',').map(Number);
                  return (
                    <g key={`ge-${coord}`} pointerEvents="none">
                      <rect x={cellLeft(x) + 2} y={cellTop(y) + 2} width={CELL - 4} height={CELL - 4} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" />
                      <Ban x={cellLeft(x) + CELL / 2 - 11} y={cellTop(y) + CELL / 2 - 11} size={22} color="#ef4444" />
                    </g>
                  );
                })}

                {/* preserved multi-finish candidates (from an imported world) */}
                {v.goalFinalPositions.map(([fx, fy], i) => (
                  <g key={`gf-${i}`} pointerEvents="none">
                    <rect x={cellLeft(fx) + 4} y={cellTop(fy) + 4} width={CELL - 8} height={CELL - 8}
                      fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 4" opacity={0.7} />
                    <Flag x={cellLeft(fx) + CELL / 2 - 9} y={cellTop(fy) + CELL / 2 - 9} size={18} color="#15803d" />
                  </g>
                ))}

                {/* goal position marker */}
                {v.goalPosition && (
                  <rect x={cellLeft(v.goalPosition.x) + 3} y={cellTop(v.goalPosition.y) + 3} width={CELL - 6} height={CELL - 6}
                    fill="none" stroke="#16a34a" strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
                )}

                {/* goal objects badge (top-left): small icon + count, with a target dot */}
                {Object.entries(v.goalObjects).map(([coord, kinds]) => {
                  const [x, y] = coord.split(',').map(Number);
                  return Object.entries(kinds).map(([k, val], i) => (
                    <g key={`g-${coord}-${k}`} pointerEvents="none">
                      <svg x={cellLeft(x) + 4} y={cellTop(y) + 4 + i * 15} width={13} height={13} viewBox="0 0 24 24">{objectGlyph(k as ObjectKind)}</svg>
                      <text x={cellLeft(x) + 19} y={cellTop(y) + 14 + i * 15} fontSize={10} fontWeight={700} fill="#15803d">{val === 'all' ? 'all' : val}</text>
                    </g>
                  ));
                })}

                {/* starting objects: colored icon(s) + count, centered */}
                {Object.entries(v.objects).map(([coord, kinds]) => {
                  const [x, y] = coord.split(',').map(Number);
                  return (
                    <g key={`o-${coord}`} pointerEvents="none">
                      {Object.entries(kinds).map(([k, val], i) => {
                        const size = 24;
                        const ix = cellLeft(x) + CELL / 2 - size / 2;
                        const iy = cellTop(y) + 6 + i * (size - 4);
                        const cnt = typeof val === 'number' ? String(val) : `${val.min}~${val.max}`;
                        return (
                          <g key={k}>
                            <svg x={ix} y={iy} width={size} height={size} viewBox="0 0 24 24">{objectGlyph(k as ObjectKind)}</svg>
                            <text x={cellLeft(x) + CELL - 5} y={iy + size - 1} fontSize={11} fontWeight={700} textAnchor="end" fill="#1e293b">{cnt}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* robot */}
                <g pointerEvents="none">
                  <circle cx={cellLeft(v.robot.x) + CELL / 2} cy={cellTop(v.robot.y) + CELL / 2} r={CELL / 3} fill="#3b82f6" />
                  <text x={cellLeft(v.robot.x) + CELL / 2} y={cellTop(v.robot.y) + CELL / 2 + 5} fontSize={16} textAnchor="middle" fill="#ffffff">{DIR_ARROW[v.robot.dir]}</text>
                </g>

                {/* goal walls (green dashed) */}
                {v.goalWalls.map(key => <WallLine key={`gw-${key}`} k={key} cellLeft={cellLeft} cellTop={cellTop} color="#16a34a" dashed />)}
                {/* walls (solid brown) */}
                {v.walls.map(key => <WallLine key={`w-${key}`} k={key} cellLeft={cellLeft} cellTop={cellTop} color="#7c2d12" />)}

                {/* edge hit zones for wall / goal-wall tools */}
                {isWallEdge && range(rows).flatMap(ry => range(cols).flatMap(cx => {
                  const x = cx + 1, y = ry + 1;
                  const L = cellLeft(x), T = cellTop(y);
                  const HIT = 12;
                  const zones: React.ReactNode[] = [];
                  zones.push(<rect key={`eN-${x},${y}`} x={L} y={T - HIT / 2} width={CELL} height={HIT} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => handleEdgeClick(x, y, 'N')} />);
                  zones.push(<rect key={`eE-${x},${y}`} x={L + CELL - HIT / 2} y={T} width={HIT} height={CELL} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => handleEdgeClick(x, y, 'E')} />);
                  if (y === 1) zones.push(<rect key={`eS-${x},${y}`} x={L} y={T + CELL - HIT / 2} width={CELL} height={HIT} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => handleEdgeClick(x, y, 'S')} />);
                  if (x === 1) zones.push(<rect key={`eW-${x},${y}`} x={L - HIT / 2} y={T} width={HIT} height={CELL} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => handleEdgeClick(x, y, 'W')} />);
                  return zones;
                }))}
              </svg>
            </div>
          </div>
          <div className="maker-zoom">
            <button className="maker-zoom-btn" onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN} aria-label={t('mk.zoomOut')} title={t('mk.zoomOut')}><ZoomOut size={16} /></button>
            <button className="maker-zoom-pct" onClick={() => setZoom(1)} aria-label={t('mk.zoomReset')} title={t('mk.zoomReset')}>{Math.round(zoom * 100)}%</button>
            <button className="maker-zoom-btn" onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX} aria-label={t('mk.zoomIn')} title={t('mk.zoomIn')}><ZoomIn size={16} /></button>
          </div>
        </div>

        {/* Right: actions + description + solution */}
        <div className="maker-side">
          <div className="maker-actions">
            <input className="maker-name" placeholder={t('mk.name')} value={state.name} onChange={e => setState(s => ({ ...s, name: e.target.value }))} />
            <div className="maker-actions-row">
              <button className="btn btn-primary mk-btn" onClick={doSave}><Save size={13} /> {t('mk.save')}</button>
              <button className="btn mk-btn" onClick={doNew}><FilePlus2 size={13} /> {t('mk.new')}</button>
              <button className="btn mk-btn" onClick={doClear}><Eraser size={13} /> {t('mk.clear')}</button>
              <button className="btn mk-btn" onClick={exportJson}><Download size={13} /> {t('mk.json')}</button>
              {editId && <button className="btn mk-btn" onClick={doDelete}><Trash2 size={13} /> {t('mk.delete')}</button>}
            </div>
            {savedMsg && <div className="maker-msg">{t(savedMsg)}</div>}
          </div>
          <label className="maker-textarea-label"><BookOpen size={14} /> {t('mk.descLabel')}</label>
          <textarea className="maker-textarea" value={state.description} placeholder={t('mk.descPlaceholder')} onChange={e => setState(s => ({ ...s, description: e.target.value }))} />
          {state.description.trim() && (
            <>
              <span className="maker-textarea-label maker-preview-label">{t('mk.descPreview')}</span>
              <div className="maker-desc-preview mission-body" dangerouslySetInnerHTML={{ __html: descPreview }} />
            </>
          )}
          <div className="maker-sol-head">
            <label className="maker-textarea-label"><Lightbulb size={14} /> {t('mk.solLabel')}</label>
            <button className="btn maker-validate-btn" onClick={doValidate} disabled={checking}>
              {checking ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} {t('mk.validate')}
            </button>
          </div>
          <textarea className="maker-textarea maker-code" value={state.solution} placeholder={'move()\nturn_left()'} onChange={e => { setState(s => ({ ...s, solution: e.target.value })); setCheckReport(null); }} />
          <SolutionReportView report={checkReport} checking={checking} />
        </div>
      </div>
    </div>
  );
}

// ---- subcomponents ----

function SolutionReportView({ report, checking }: { report: SolutionReport | null; checking: boolean }) {
  const { t, lang } = useI18n();
  if (checking) return <div className="maker-check maker-check-info"><Loader2 size={14} className="spin" /> {t('mk.checking')}</div>;
  if (!report) return null;

  const multi = report.checks.length > 1;
  return (
    <div className="maker-check">
      <div className={`maker-check-summary ${report.ok ? 'ok' : 'bad'}`}>
        {report.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {t(report.ok ? 'mk.checkPass' : 'mk.checkFail')}
      </div>
      {report.checks.map((c, i) => (
        <CheckRow key={i} c={c} showVariant={multi} t={t} lang={lang} />
      ))}
    </div>
  );
}

function CheckRow({ c, showVariant, t, lang }: { c: SolutionCheck; showVariant: boolean; t: (k: string, v?: Record<string, string | number>) => string; lang: 'ko' | 'en' }) {
  const good = c.status === 'success' || c.status === 'noGoal';
  let detail: string;
  switch (c.status) {
    case 'success': detail = t('mk.checkVariantOk'); break;
    case 'noGoal': detail = t('mk.checkNoGoal'); break;
    case 'fail': detail = t('mk.checkVariantFail'); break;
    case 'engineError': detail = reasonToMessage(c.engineReason, lang) + (c.errorLine ? ` (${t('mk.checkLine', { line: c.errorLine })})` : ''); break;
    case 'preflight': detail = t('preflight.parens', { line: c.errorLine ?? 0, name: c.preflightName ?? '' }); break;
    case 'pyError': detail = parsePythonError(c.pyRaw ?? '', lang).friendly; break;
    default: detail = '';
  }
  return (
    <div className={`maker-check-row ${good ? 'ok' : 'bad'}`}>
      <div className="maker-check-row-head">
        {good ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
        <span>{showVariant && c.variant > 0 ? t('mk.variant', { n: c.variant }) + ' — ' : ''}{detail}</span>
      </div>
      {(c.status === 'fail' || c.status === 'success') && c.goalItems.length > 0 && (
        <ul className="maker-check-goals">
          {c.goalItems.map((g, j) => (
            <li key={j} className={g.ok ? 'ok' : 'bad'}>{g.ok ? '✓' : '✗'} {g.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContextBar(p: {
  tool: Tool;
  count: number; setCount: (n: number) => void;
  random: boolean; setRandom: (b: boolean) => void;
  rmin: number; setRmin: (n: number) => void; rmax: number; setRmax: (n: number) => void;
  goalAll: boolean; setGoalAll: (b: boolean) => void;
}) {
  const { t } = useI18n();
  const { tool } = p;
  const isObj = tool.startsWith('obj:');
  const isGoalObj = tool.startsWith('goalObj:');
  const kind = (isObj ? tool.slice(4) : isGoalObj ? tool.slice(8) : '') as ObjectKind;

  let body: React.ReactNode;
  if (isObj) {
    body = (
      <>
        <span className="ctx-title"><ObjectIcon kind={kind} size={18} /> {t('ctx.place', { kind: t(`kind.${kind}`) })}</span>
        {!p.random && <Stepper label={t('ctx.count')} value={p.count} onChange={p.setCount} min={1} />}
        <label className="ctx-check"><input type="checkbox" checked={p.random} onChange={e => p.setRandom(e.target.checked)} /> {t('ctx.random')}</label>
        {p.random && (
          <span className="ctx-range">
            <input type="number" min={0} value={p.rmin} onChange={e => p.setRmin(Math.max(0, parseInt(e.target.value || '0', 10)))} /> ~
            <input type="number" min={0} value={p.rmax} onChange={e => p.setRmax(Math.max(0, parseInt(e.target.value || '0', 10)))} />
          </span>
        )}
      </>
    );
  } else if (isGoalObj) {
    body = (
      <>
        <span className="ctx-title"><Target size={16} /> <ObjectIcon kind={kind} size={18} /> {t('ctx.goal', { kind: t(`kind.${kind}`) })}</span>
        {!p.goalAll && <Stepper label={t('ctx.count')} value={p.count} onChange={p.setCount} min={1} />}
        <label className="ctx-check"><input type="checkbox" checked={p.goalAll} onChange={e => p.setGoalAll(e.target.checked)} /> {t('ctx.all')}</label>
      </>
    );
  } else {
    const hintKey: Record<string, string> = {
      wall: 'ctx.hint.wall', goalWall: 'ctx.hint.goalWall', goalEmpty: 'ctx.hint.goalEmpty',
      goalPos: 'ctx.hint.goalPos', robot: 'ctx.hint.robot', erase: 'ctx.hint.erase'
    };
    const key = hintKey[tool] ?? (tool.startsWith('tile:') ? 'ctx.hint.tile' : 'ctx.hint.none');
    body = <span className="ctx-hint">{t(key)}</span>;
  }
  return <div className="maker-context-bar">{body}</div>;
}

function Stepper({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <span className="ctx-stepper">
      <span className="ctx-label">{label}</span>
      <button onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="ctx-value">{value}</span>
      <button onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

function WallLine({ k, cellLeft, cellTop, color, dashed }: { k: string; cellLeft: (x: number) => number; cellTop: (y: number) => number; color: string; dashed?: boolean }) {
  const [sx, sy, d] = k.split(',');
  const x = parseInt(sx, 10), y = parseInt(sy, 10);
  const dir = d as Direction;
  const L = cellLeft(x), T = cellTop(y);
  let x1 = L, y1 = T, x2 = L, y2 = T;
  if (dir === 'N') { x2 = L + CELL; }
  else if (dir === 'S') { y1 = T + CELL; x2 = L + CELL; y2 = T + CELL; }
  else if (dir === 'E') { x1 = L + CELL; x2 = L + CELL; y2 = T + CELL; }
  else if (dir === 'W') { y2 = T + CELL; }
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={dashed ? '7 5' : undefined} pointerEvents="none" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tool-group">
      <div className="tool-group-title">{title}</div>
      {children}
    </div>
  );
}

function ToolCard({ active, onClick, icon, label, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <button className={`tool-card${active ? ' active' : ''}`} onClick={onClick}>
      <span className="tool-emoji">{icon}</span>
      <span className="tool-card-label">{label}</span>
      {hint && <span className="tool-card-hint">{hint}</span>}
    </button>
  );
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function slugify(name: string): string {
  return name.trim().replace(/\s+/g, '-') || 'world';
}

function uniqueId(base: string): string {
  const existing = new Set(listCustomWorlds().map(r => r.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
