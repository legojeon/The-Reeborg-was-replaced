import React from 'react';
import { Viewport } from './ui/components/Viewport';
import { Controls } from './ui/components/Controls';
import { Editor } from './ui/components/Editor';
import { createDefaultWorld } from './core/world/world';
import type { World } from './core/types/types';
import { loadReeborgWorld } from './core/world/loader';
import { useExecution } from './ui/useExecution';
import { ResultPanel } from './ui/components/ResultPanel';

export default function App() {
  const [world, setWorld] = React.useState<World>(() => createDefaultWorld(10, 10));
  const [code, setCode] = React.useState<string>(() => [
    'think(100)',
    'move()',
    'turn_left()',
    'move()'
  ].join('\n'));
  const [selectedWorldId, setSelectedWorldId] = React.useState<string | null>(null);
  const [worlds, setWorlds] = React.useState<Array<{ id: string; name: string; path: string }>>([]);

  React.useEffect(() => {
    async function loadIndex() {
      try {
        const res = await fetch('/worlds/index.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load index.json: ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data?.worlds)) {
          setWorlds(data.worlds);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Worlds] Could not load /worlds/index.json', e);
        setWorlds([]);
      }
    }
    loadIndex();
  }, []);

  const {
    robot,
    objects,
    walls,
    status,
    statusKind,
    reverseTurn,
    handleRun,
    handleNext,
    handlePrev,
    handleReset,
    onWorldChanged
  } = useExecution(world, code);

  async function handleSelectWorld(id: string | null) {
    setSelectedWorldId(id);
    if (!id) {
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
    const meta = worlds.find(w => w.id === id);
    if (!meta) return;
    try {
      const loaded = await loadReeborgWorld(meta.path);
      setWorld(loaded);
      onWorldChanged(loaded);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleResetApp() {
    // If a world is selected from the index, reload it from source to fully reinitialize
    if (selectedWorldId) {
      const meta = worlds.find(w => w.id === selectedWorldId);
      if (meta) {
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
    // Fallback: use execution hook reset (it re-randomizes ranges and re-hides labels)
    handleReset();
  }

  return (
    <div className="app-root">
      <div className="viewport-wrap">
        <Viewport world={world} robot={robot} reverseTurn={reverseTurn} objects={objects} walls={walls} statusKind={statusKind} />
      </div>
      <div className="side-panel">
        <Controls
          onRun={handleRun}
          onPrev={handlePrev}
          onNext={handleNext}
          onReset={handleResetApp}
          worlds={worlds}
          selectedWorldId={selectedWorldId}
          onSelectWorld={handleSelectWorld}
        />
        <div style={{ display: 'grid', gridTemplateRows: '650px 1fr', rowGap: 8, minHeight: 0, minWidth: 0, height: '100%' }}>
          <Editor code={code} onChange={setCode} />
          <ResultPanel status={status} kind={statusKind} />
        </div>
      </div>
    </div>
  );
}



