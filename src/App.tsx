import React from 'react';
import { Viewport } from './ui/components/Viewport';
import { Controls, type WorldOption } from './ui/components/Controls';
import { Editor } from './ui/components/Editor';
import { createDefaultWorld } from './core/world/world';
import type { World } from './core/types/types';
import { loadReeborgWorld, normalizeWorld } from './core/world/loader';
import { useExecution } from './ui/useExecution';
import { ResultPanel } from './ui/components/ResultPanel';
import { useNavigate, useParams } from 'react-router-dom';
import { MissionPanel } from './ui/components/MissionPanel';
import { HelpButton } from './ui/components/HelpButton';
import { SuccessPopup } from './ui/components/popup/SuccessPopup';
import { FailurePopup } from './ui/components/popup/FailurePopup';
import { DonePopup } from './ui/components/popup/DonePopup';
import { getProgress, markCleared } from './ui/progress';
import { listCustomWorlds, getCustomWorld, getHiddenBuiltins, CUSTOM_ID_PREFIX } from './ui/customWorlds';
import { useI18n } from './ui/i18n';

const DEFAULT_CODE = ['think(100)', 'move()', 'turn_left()', 'move()'].join('\n');

const SIDEBAR_KEY = 'reeborg3d.sidebarWidth';
const SIDEBAR_MIN = 360;
const SIDEBAR_MAX = 760;

const RESULT_KEY = 'reeborg3d.resultHeight';
const RESULT_MIN = 56;
const RESULT_DEFAULT = 130;

// Per-mission code cache. Each world (and the default free-play buffer) keeps its
// own code in localStorage, so switching missions or refreshing restores what the
// user last typed for that world.
const CODE_KEY_PREFIX = 'reeborg3d.code.';
const codeKey = (id: string | null) => CODE_KEY_PREFIX + (id ?? '__default__');
function loadCachedCode(id: string | null): string {
  try {
    const v = localStorage.getItem(codeKey(id));
    return v != null ? v : DEFAULT_CODE;
  } catch {
    return DEFAULT_CODE;
  }
}
// Strip characters that are illegal in filenames so the download name is safe.
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'reeborg';
}

export default function App() {
  const { lang, t } = useI18n();
  const [world, setWorld] = React.useState<World>(() => createDefaultWorld(10, 10));
  const [code, setCode] = React.useState<string>(() => loadCachedCode(null));
  const [selectedWorldId, setSelectedWorldId] = React.useState<string | null>(null);
  const [worlds, setWorlds] = React.useState<WorldOption[]>([]);
  const [customWorlds, setCustomWorlds] = React.useState<WorldOption[]>([]);
  const [cleared, setCleared] = React.useState<Set<string>>(() => new Set(Object.keys(getProgress())));
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => {
    const saved = parseInt(localStorage.getItem(SIDEBAR_KEY) ?? '', 10);
    return Number.isFinite(saved) ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, saved)) : 480;
  });
  const draggingRef = React.useRef(false);
  const [resultHeight, setResultHeight] = React.useState<number>(() => {
    const saved = parseInt(localStorage.getItem(RESULT_KEY) ?? '', 10);
    return Number.isFinite(saved) ? Math.max(RESULT_MIN, saved) : RESULT_DEFAULT;
  });
  const draggingResultRef = React.useRef(false);
  const resultHeightRef = React.useRef(resultHeight);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const params = useParams();
  const routeWorldId = (params.worldId as string | undefined) ?? null;
  const [showSuccess, setShowSuccess] = React.useState<boolean>(false);
  const [showFailure, setShowFailure] = React.useState<boolean>(false);
  const [showDone, setShowDone] = React.useState<boolean>(false);
  const initializedRef = React.useRef<boolean>(false);
  // Skip the very first save so the initial mount doesn't clobber a cached buffer
  // before the active world (and its code) has loaded.
  const codeSaveReadyRef = React.useRef<boolean>(false);
  // Normalize IDs to handle NFC/NFD differences for Korean text in URLs and index.json
  const norm = React.useCallback((s: string | null | undefined) => {
    if (s == null) return s as any;
    try {
      return s.normalize('NFC');
    } catch {
      return s;
    }
  }, []);

  React.useEffect(() => {
    async function loadIndex() {
      try {
        const res = await fetch('/worlds/index.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load index.json: ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data?.worlds)) {
          setWorlds(data.worlds.map((w: any) => ({ ...w, custom: false })));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Worlds] Could not load /worlds/index.json', e);
        setWorlds([]);
      }
    }
    loadIndex();
  }, []);

  // Load custom worlds from localStorage (and refresh when returning from the maker)
  const refreshCustomWorlds = React.useCallback(() => {
    setCustomWorlds(listCustomWorlds().map(r => ({
      id: CUSTOM_ID_PREFIX + r.id,
      name: r.name,
      custom: true
    })));
  }, []);
  React.useEffect(() => {
    refreshCustomWorlds();
  }, [refreshCustomWorlds]);

  // Catalog shown in the dropdown = custom worlds first, then built-in missions
  // that the user has not hidden in the world manager.
  const allWorlds = React.useMemo(() => {
    const hidden = new Set(getHiddenBuiltins());
    return [...customWorlds, ...worlds.filter(w => !hidden.has(w.id))];
  }, [worlds, customWorlds]);

  // Auto-cache the editor code for the active world whenever it changes (typing,
  // solution apply, etc.). The first run is skipped via codeSaveReadyRef.
  React.useEffect(() => {
    if (!codeSaveReadyRef.current) {
      codeSaveReadyRef.current = true;
      return;
    }
    try {
      localStorage.setItem(codeKey(selectedWorldId), code);
    } catch {
      /* storage full or unavailable — ignore */
    }
  }, [code, selectedWorldId]);

  const {
    robot,
    objects,
    walls,
    status,
    statusKind,
    output,
    reverseTurn,
    activeLine,
    errorLine,
    errorDetail,
    goalChecks,
    runOutcome,
    stepMs,
    handleRun,
    handleStop,
    handleNext,
    handlePrev,
    handleReset,
    onWorldChanged
  } = useExecution(world, code, lang);

  async function handleSelectWorld(id: string | null) {
    const idNorm = norm(id);
    if (!idNorm) {
      setSelectedWorldId(null);
      setCode(loadCachedCode(null));
      try {
        const loaded = await loadReeborgWorld('/worlds/base.json');
        setWorld(loaded);
        onWorldChanged(loaded);
        return;
      } catch (_e) {
        const def = createDefaultWorld(10, 10);
        setWorld(def);
        onWorldChanged(def);
        return;
      }
    }
    // Custom (localStorage) world
    if (idNorm.startsWith(CUSTOM_ID_PREFIX)) {
      const rec = getCustomWorld(idNorm.slice(CUSTOM_ID_PREFIX.length));
      if (!rec) return;
      setSelectedWorldId(idNorm);
      setCode(loadCachedCode(idNorm));
      try {
        const loaded = normalizeWorld(rec.data);
        setWorld(loaded);
        onWorldChanged(loaded);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    const meta = allWorlds.find(w => norm(w.id) === idNorm);
    if (!meta || !meta.path) {
      // Worlds index not loaded yet; defer selection until it is available
      return;
    }
    setSelectedWorldId(meta.id);
    setCode(loadCachedCode(meta.id));
    try {
      const loaded = await loadReeborgWorld(meta.path);
      setWorld(loaded);
      onWorldChanged(loaded);
    } catch (e) {
      console.error(e);
    }
  }

  // Keep UI selection and world loading in sync with the current route param
  React.useEffect(() => {
    if (routeWorldId) {
      if (norm(routeWorldId) !== norm(selectedWorldId)) {
        void handleSelectWorld(routeWorldId);
      }
    } else {
      if (!initializedRef.current || selectedWorldId !== null) {
        initializedRef.current = true;
        void handleSelectWorld(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeWorldId, worlds, customWorlds]);

  // Dropdown change handler: navigate; loading will be handled by route effect above
  function handleSelectWorldFromUI(id: string | null) {
    if (!id) {
      navigate('/');
    } else {
      navigate(`/world/${encodeURIComponent(id)}`);
    }
  }

  // Open popups ONLY when a run actually finishes (success/fail/done/error).
  // Driven by runOutcome — never by live preflight/typing errors — so a popup
  // never appears without the user pressing Run.
  React.useEffect(() => {
    if (!runOutcome) return;
    if (runOutcome.type === 'success') {
      setShowSuccess(true);
      if (selectedWorldId) {
        markCleared(selectedWorldId);
        setCleared(new Set(Object.keys(getProgress())));
      }
    } else if (runOutcome.type === 'fail' || runOutcome.type === 'error') {
      setShowFailure(true);
    } else if (runOutcome.type === 'done') {
      setShowDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runOutcome]);

  async function handleResetApp() {
    if (selectedWorldId) {
      // Reload from source (built-in or custom) to fully reinitialize
      if (selectedWorldId.startsWith(CUSTOM_ID_PREFIX)) {
        const rec = getCustomWorld(selectedWorldId.slice(CUSTOM_ID_PREFIX.length));
        if (rec) {
          try {
            const loaded = normalizeWorld(rec.data);
            setWorld(loaded);
            onWorldChanged(loaded);
            return;
          } catch { /* fall through */ }
        }
      } else {
        const meta = allWorlds.find(w => w.id === selectedWorldId);
        if (meta?.path) {
          try {
            const loaded = await loadReeborgWorld(meta.path);
            setWorld(loaded);
            onWorldChanged(loaded);
            return;
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[Reset] Failed to reload world, falling back to local reset', e);
          }
        }
      }
    }
    handleReset();
  }

  function handleShowSolution() {
    if (!world.solution) return;
    const ok = window.confirm(t('app.solutionConfirm'));
    if (ok) setCode(world.solution);
  }

  // Drag the divider between the 3D viewport and the side panel
  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, window.innerWidth - e.clientX));
      setSidebarWidth(w);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarWidth]);

  function startDrag() {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // Drag the divider between the editor and the result panel
  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingResultRef.current || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const h = Math.min(rect.height - 120, Math.max(RESULT_MIN, rect.bottom - e.clientY - 3));
      resultHeightRef.current = h;
      setResultHeight(h);
    }
    function onUp() {
      if (!draggingResultRef.current) return;
      draggingResultRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(RESULT_KEY, String(Math.round(resultHeightRef.current)));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function startResultDrag() {
    draggingResultRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  const runFinished = status === 'success' || status === 'fail';
  const isRunning = statusKind === 'running';
  const isMission = !!world.goal;

  // Filename for the code download — based on the current world's name.
  const downloadName = React.useMemo(() => {
    const meta = selectedWorldId ? allWorlds.find(w => w.id === selectedWorldId) : null;
    const base = meta?.name ?? t('app.freePlayFile');
    return safeFileName(base) + '.py';
  }, [selectedWorldId, allWorlds, t]);

  return (
    <div className="app-root" style={{ gridTemplateColumns: `1fr 6px ${sidebarWidth}px` }}>
      <div className="left-col">
        <div className="left-header">
          <Controls
            onRun={handleRun}
            onStop={handleStop}
            onPrev={handlePrev}
            onNext={handleNext}
            onReset={handleResetApp}
            running={isRunning}
            worlds={allWorlds}
            selectedWorldId={selectedWorldId}
            onSelectWorld={handleSelectWorldFromUI}
            cleared={cleared}
            hasSolution={!!world.solution}
            onShowSolution={handleShowSolution}
          />
          <MissionPanel html={world.description} isMission={isMission} checks={goalChecks} showChecks={runFinished} />
        </div>
        <div className="viewport-wrap">
          <Viewport world={world} robot={robot} reverseTurn={reverseTurn} stepMs={stepMs} objects={objects} walls={walls} status={status} statusKind={statusKind} />
        </div>
        <HelpButton />
      </div>
      <div
        className="resizer"
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 너비 조절"
      />
      <div className="side-panel">
        <div className="editor-result-wrap" ref={wrapRef} style={{ gridTemplateRows: `minmax(0, 1fr) 6px ${resultHeight}px` }}>
          <Editor code={code} onChange={setCode} activeLine={activeLine} errorLine={errorLine} downloadName={downloadName} />
          <div
            className="h-resizer"
            onMouseDown={startResultDrag}
            role="separator"
            aria-orientation="horizontal"
            aria-label="결과 창 높이 조절"
          />
          <ResultPanel status={status} kind={statusKind} output={output} errorDetail={errorDetail} />
        </div>
      </div>
      <SuccessPopup
        visible={showSuccess}
        title={t('popup.successTitle')}
        message={t('popup.successMsg')}
        confirmLabel={t('popup.ok')}
        autoHideMs={3000}
        onClose={() => setShowSuccess(false)}
      />
      <FailurePopup
        visible={showFailure}
        title={statusKind === 'error' ? t('popup.errorTitle') : t('popup.failTitle')}
        message={statusKind === 'error' ? status : t('popup.failMsg')}
        detail={statusKind === 'error' ? errorDetail ?? undefined : undefined}
        confirmLabel={t('popup.ok')}
        sizePx={520}
        onClose={() => setShowFailure(false)}
      />
      <DonePopup
        visible={showDone}
        title={t('popup.doneTitle')}
        message={t('popup.doneMsg')}
        confirmLabel={t('popup.ok')}
        onClose={() => setShowDone(false)}
      />
    </div>
  );
}
