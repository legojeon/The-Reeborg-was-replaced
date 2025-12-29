import React from 'react';
import { createEngine } from '../core/engine/engine';
import { createPyBridge, validatePythonActions } from '../core/py/pyodide';
import type { RobotPose, World } from '../core/types/types';
import { reasonToMessage } from './messages';
import { evaluateGoal } from '../core/world/goal';

type StatusKind = 'info' | 'running' | 'error';

export function useExecution(world: World, code: string) {
  const engineRef = React.useRef(createEngine(world));
  const pyRef = React.useRef(createPyBridge());
  const runTimerRef = React.useRef<number | null>(null);

  const [robot, setRobot] = React.useState<RobotPose>(world.robot);
  const [objects, setObjects] = React.useState<World['objects'] | undefined>(world.objects);
  const [walls, setWalls] = React.useState<World['walls'] | undefined>(world.walls);
  const [status, setStatus] = React.useState<string>(world.description ?? '자유롭게 움직여보세요.');
  const [statusKind, setStatusKind] = React.useState<StatusKind>('info');
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [reverseTurn, setReverseTurn] = React.useState<boolean>(false);

  React.useEffect(() => {
    const unsub = engineRef.current.subscribe((e: any) => {
      if (!e.ok) {
        // eslint-disable-next-line no-console
        console.warn('[Engine]', `step=${e.step}`, `action=${e.action.type}`, 'FAILED', `reason=${e.reason}`);
        setStatus(reasonToMessage(e.reason));
        setStatusKind('error');
      } else {
        // eslint-disable-next-line no-console
        console.log('[Engine]', `step=${e.step}`, `action=${e.action.type}`, e.after?.robot);
      }
      const state = e.ok ? e.after! : e.before;
      setRobot(state.robot);
      setObjects(state.objects);
      setWalls(state.walls);
    });
    return () => unsub();
  }, []);

  // Live preflight: show API misuse while editing (skip during running)
  React.useEffect(() => {
    if (statusKind === 'running') return;
    const pre = validatePythonActions(code);
    if (!pre.ok) {
      setStatus(pre.errors[0] ?? 'Invalid code.');
      setStatusKind('error');
    } else if (statusKind === 'error' && (status.startsWith('Line ') || status.includes('Invalid code'))) {
      setStatus(world.description ?? '자유롭게 움직여보세요.');
      setStatusKind('info');
    }
  }, [code, statusKind, status, world.description]);

  function clearRunTimer() {
    if (runTimerRef.current !== null) {
      clearInterval(runTimerRef.current);
      runTimerRef.current = null;
    }
  }

  function deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

  function revealWorldObjects(src: World): World {
    const w = deepClone(src);
    if (w.objects) {
      for (const o of w.objects) {
        if (o.hidden) o.hidden = false;
      }
    }
    return w;
  }

  async function handleRun() {
    clearRunTimer();
    setReverseTurn(false);
    const pre = validatePythonActions(code);
    if (!pre.ok) {
      // eslint-disable-next-line no-console
      console.error('[Preflight] Invalid API usage:', pre.errors.join(' | '));
      setStatus(pre.errors[0] ?? 'Invalid code.');
      setStatusKind('error');
      return;
    }
    setStatus('Running...');
    setStatusKind('running');
    const revealed = revealWorldObjects(world);
    // Update UI immediately to reveal labels before first step
    setObjects(revealed.objects);
    engineRef.current.reset(revealed);
    await pyRef.current.init(engineRef.current);
    try {
      await pyRef.current.runUserCode(code);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UI] Python execution error', err);
      const msg = (err as any)?.message ?? String(err);
      setStatus(`Python error: ${msg}`);
      setStatusKind('error');
      return;
    }
    const pace = Math.max(1, Number(pyRef.current.getPaceMs() || 1));
    runTimerRef.current = window.setInterval(() => {
      const ev = engineRef.current.step();
      if (!ev) {
        clearRunTimer();
        // Evaluate goal if present
        try {
          const finalState = engineRef.current.getState();
          const ok = evaluateGoal(finalState, finalState.goal);
          setStatus(ok ? 'success' : 'fail');
          setStatusKind('info');
        } catch {
          setStatus(world.description ?? '자유롭게 움직여보세요.');
          setStatusKind('info');
        }
      } else if (ev.ok) {
        setCurrentStep((s) => s + 1);
      } else {
        clearRunTimer();
        setStatus(reasonToMessage(ev.reason));
        setStatusKind('error');
      }
    }, pace);
  }

  async function handleNext() {
    clearRunTimer();
    setReverseTurn(false);
    let ev = engineRef.current.step();
    if (!ev && currentStep === 0) {
      const pre = validatePythonActions(code);
      if (!pre.ok) {
        // eslint-disable-next-line no-console
        console.error('[Preflight] Invalid API usage:', pre.errors.join(' | '));
        setStatus(pre.errors[0] ?? 'Invalid code.');
        setStatusKind('error');
        return;
      }
      setStatus('Running...');
      setStatusKind('running');
      const revealed = revealWorldObjects(world);
      // show revealed labels before first step
      setObjects(revealed.objects);
      await pyRef.current.init(engineRef.current);
      engineRef.current.reset(revealed);
      try {
        await pyRef.current.runUserCode(code); // enqueue actions only
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[UI] Python execution error', err);
        const msg = (err as any)?.message ?? String(err);
        setStatus(`Python error: ${msg}`);
        setStatusKind('error');
        return;
      }
      ev = engineRef.current.step();
    }
    if (ev && ev.ok) setCurrentStep((s) => s + 1);
    if (ev && !ev.ok) {
      setStatus(reasonToMessage(ev.reason));
      setStatusKind('error');
    }
  }

  async function handlePrev() {
    clearRunTimer();
    setReverseTurn(true);
    const state = engineRef.current.stepPrev();
    if (state) {
      setCurrentStep((s) => Math.max(0, s - 1));
      setRobot(state.robot);
      setObjects(state.objects);
    }
  }

  function handleReset() {
    clearRunTimer();
    setReverseTurn(false);
    engineRef.current.reset(world);
    setRobot(world.robot);
    setObjects(world.objects);
    setWalls(world.walls);
    setCurrentStep(0);
    setStatus(world.description ?? '자유롭게 움직여보세요.');
    setStatusKind('info');
  }

  function onWorldChanged(newWorld: World) {
    clearRunTimer();
    setReverseTurn(false);
    engineRef.current.reset(newWorld);
    setRobot(newWorld.robot);
    setObjects(newWorld.objects);
    setWalls(newWorld.walls);
    setCurrentStep(0);
    setStatus(newWorld.description ?? '자유롭게 움직여보세요.');
    setStatusKind('info');
  }

  return {
    robot,
    objects,
    walls,
    status,
    statusKind,
    currentStep,
    reverseTurn,
    handleRun,
    handleNext,
    handlePrev,
    handleReset,
    onWorldChanged
  };
}


