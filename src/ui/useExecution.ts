import React from 'react';
import { createEngine } from '../core/engine/engine';
import { createPyBridge, validatePythonActions } from '../core/py/pyodide';
import type { RobotPose, World } from '../core/types/types';
import { reasonToMessage } from './messages';
import { evaluateGoalDetail, type GoalCheckItem } from '../core/world/goal';
import { parsePythonError } from './pythonErrors';
import { tr, type Lang } from './i18n';
import { unlockOutcomeAudio } from './outcomeAudio';

type StatusKind = 'info' | 'running' | 'error';

// The status is stored as a descriptor (what happened) rather than a translated
// string, so it can be re-rendered in the current language when the user toggles
// languages. 'success'/'fail'/'done'/'Running...' stay literal sentinels that
// App.tsx / ResultPanel match on.
type StatusDesc =
  | { type: 'ready' }
  | { type: 'stopped' }
  | { type: 'running' }
  | { type: 'success' }
  | { type: 'fail' }
  | { type: 'done' }
  | { type: 'engineError'; reason?: string; line?: number }
  | { type: 'pyError'; raw: string }
  | { type: 'preflight'; line: number; name: string };

interface DerivedStatus {
  status: string;
  kind: StatusKind;
  errorLine: number | null;
  errorDetail: string | null;
}

function deriveStatus(desc: StatusDesc, lang: Lang): DerivedStatus {
  switch (desc.type) {
    case 'ready': return { status: tr(lang, 'status.ready'), kind: 'info', errorLine: null, errorDetail: null };
    case 'stopped': return { status: tr(lang, 'status.stopped'), kind: 'info', errorLine: null, errorDetail: null };
    case 'running': return { status: 'Running...', kind: 'running', errorLine: null, errorDetail: null };
    case 'success': return { status: 'success', kind: 'info', errorLine: null, errorDetail: null };
    case 'fail': return { status: 'fail', kind: 'info', errorLine: null, errorDetail: null };
    case 'done': return { status: 'done', kind: 'info', errorLine: null, errorDetail: null };
    case 'engineError': return { status: reasonToMessage(desc.reason, lang), kind: 'error', errorLine: desc.line ?? null, errorDetail: null };
    case 'pyError': {
      const p = parsePythonError(desc.raw, lang);
      return { status: p.friendly, kind: 'error', errorLine: p.line ?? null, errorDetail: p.detail };
    }
    case 'preflight': return { status: tr(lang, 'preflight.parens', { line: desc.line, name: desc.name }), kind: 'error', errorLine: desc.line, errorDetail: null };
  }
}

export function useExecution(world: World, code: string, lang: Lang = 'ko') {
  const engineRef = React.useRef(createEngine(world));
  const pyRef = React.useRef(createPyBridge());
  const runTimerRef = React.useRef<number | null>(null);
  // Incremented on every run; lets Stop cancel a run that is still loading
  // Pyodide or executing user code (before the step interval has started).
  const runTokenRef = React.useRef(0);
  // True while the current error came from preflight (so editing can clear it)
  const preflightErrorRef = React.useRef<boolean>(false);
  // Latest lang for callbacks registered once (engine subscription).
  const langRef = React.useRef(lang);
  langRef.current = lang;
  // Descriptor of the current status, so language toggles can re-translate it.
  const statusDescRef = React.useRef<StatusDesc>({ type: 'ready' });
  // Final world snapshot of the last finished run, so the goal checklist can be
  // re-translated on a language switch.
  const goalEvalRef = React.useRef<World | null>(null);

  const [robot, setRobot] = React.useState<RobotPose>(world.robot);
  const [objects, setObjects] = React.useState<World['objects'] | undefined>(world.objects);
  const [walls, setWalls] = React.useState<World['walls'] | undefined>(world.walls);
  const [status, setStatus] = React.useState<string>(() => tr(lang, 'status.ready'));
  const [statusKind, setStatusKind] = React.useState<StatusKind>('info');
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [reverseTurn, setReverseTurn] = React.useState<boolean>(false);
  const [output, setOutput] = React.useState<string>('');
  // 1-based line of the user's code currently executing (for editor highlight)
  const [activeLine, setActiveLine] = React.useState<number | null>(null);
  // 1-based line where an error occurred (engine failure or Python error)
  const [errorLine, setErrorLine] = React.useState<number | null>(null);
  // Short technical detail of a Python error (e.g. "NameError: ...")
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null);
  // Per-condition goal checklist computed when a run finishes
  const [goalChecks, setGoalChecks] = React.useState<GoalCheckItem[]>([]);
  // Current step interval (ms) → the renderer glides the robot over this time.
  const [stepMs, setStepMs] = React.useState<number>(140);
  // Terminal result of a run (used to open popups). Only set by run paths —
  // NEVER by live preflight/typing — so popups never open without a run.
  const [runOutcome, setRunOutcome] = React.useState<{ type: 'success' | 'fail' | 'done' | 'error'; n: number } | null>(null);
  const outcomeN = React.useRef(0);
  function emitOutcome(type: 'success' | 'fail' | 'done' | 'error') {
    setRunOutcome({ type, n: ++outcomeN.current });
  }

  // Set the status from a descriptor and render it in the current language.
  function applyStatus(desc: StatusDesc) {
    statusDescRef.current = desc;
    const r = deriveStatus(desc, langRef.current);
    setStatus(r.status);
    setStatusKind(r.kind);
    setErrorLine(r.errorLine);
    setErrorDetail(r.errorDetail);
  }

  React.useEffect(() => {
    const unsub = engineRef.current.subscribe((e: any) => {
      if (!e.ok) {
        // eslint-disable-next-line no-console
        console.warn('[Engine]', `step=${e.step}`, `action=${e.action.type}`, 'FAILED', `reason=${e.reason}`);
        applyStatus({ type: 'engineError', reason: e.reason, line: typeof e.action?.line === 'number' ? e.action.line : undefined });
        emitOutcome('error');
      } else if (typeof e.action?.line === 'number') {
        setActiveLine(e.action.line);
      }
      // Append queued prints/traces in execution order
      if (e.action?.type === 'trace' && typeof e.action?.message === 'string') {
        setOutput((prev) => prev + e.action.message);
      }
      const state = e.ok ? e.after! : e.before;
      setRobot(state.robot);
      setObjects(state.objects);
      setWalls(state.walls);
    });
    return () => unsub();
  }, []);

  // Connect Python stdout/stderr to output panel
  React.useEffect(() => {
    try {
      pyRef.current.setStdoutHandler?.((s: string) => {
        setOutput((prev) => prev + s);
      });
      pyRef.current.setStderrHandler?.((s: string) => {
        setOutput((prev) => prev + s);
      });
    } catch {
      // ignore
    }
  }, []);

  // Re-translate the visible status and goal checklist when the language switches.
  React.useEffect(() => {
    const r = deriveStatus(statusDescRef.current, lang);
    setStatus(r.status);
    setStatusKind(r.kind);
    setErrorLine(r.errorLine);
    setErrorDetail(r.errorDetail);
    if (goalEvalRef.current?.goal) {
      setGoalChecks(evaluateGoalDetail(goalEvalRef.current, goalEvalRef.current.goal, lang).items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Live preflight: show API misuse while editing (skip during running)
  React.useEffect(() => {
    if (statusKind === 'running') return;
    const pre = validatePythonActions(code);
    if (!pre.ok) {
      preflightErrorRef.current = true;
      applyStatus({ type: 'preflight', line: pre.errors[0].line, name: pre.errors[0].name });
    } else if (statusKind === 'error' && preflightErrorRef.current) {
      preflightErrorRef.current = false;
      applyStatus({ type: 'ready' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, statusKind]);

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

  function clearRunFeedback() {
    setActiveLine(null);
    setErrorLine(null);
    setErrorDetail(null);
    setGoalChecks([]);
    goalEvalRef.current = null;
  }

  function reportPreflight(errors: { line: number; name: string }[]) {
    preflightErrorRef.current = true;
    if (errors[0]) applyStatus({ type: 'preflight', line: errors[0].line, name: errors[0].name });
    else applyStatus({ type: 'ready' });
  }

  function reportPythonError(err: unknown) {
    const raw = (err as any)?.message ?? String(err);
    applyStatus({ type: 'pyError', raw });
    emitOutcome('error');
  }

  function finishRun() {
    setActiveLine(null);
    try {
      const finalState = engineRef.current.getState();
      if (!finalState.goal) {
        goalEvalRef.current = null;
        applyStatus({ type: 'done' });
        emitOutcome('done');
      } else {
        goalEvalRef.current = finalState;
        const detail = evaluateGoalDetail(finalState, finalState.goal, langRef.current);
        setGoalChecks(detail.items);
        applyStatus({ type: detail.ok ? 'success' : 'fail' });
        emitOutcome(detail.ok ? 'success' : 'fail');
      }
    } catch {
      applyStatus({ type: 'ready' });
    }
  }

  async function handleRun() {
    // This runs synchronously inside the Run button's click handler. Resuming
    // Web Audio here preserves permission for sounds played after async work.
    unlockOutcomeAudio();
    clearRunTimer();
    setReverseTurn(false);
    setOutput('');
    clearRunFeedback();
    const pre = validatePythonActions(code);
    if (!pre.ok) {
      reportPreflight(pre.errors);
      return;
    }
    const myToken = ++runTokenRef.current;
    applyStatus({ type: 'running' });
    const revealed = revealWorldObjects(world);
    // Update UI immediately to reveal labels before first step
    setObjects(revealed.objects);
    engineRef.current.reset(revealed);
    await pyRef.current.init(engineRef.current);
    if (runTokenRef.current !== myToken) return; // stopped while loading Pyodide
    try {
      await pyRef.current.runUserCode(code);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UI] Python execution error', err);
      reportPythonError(err);
      return;
    }
    if (runTokenRef.current !== myToken) return; // stopped during code execution
    const pace = Math.max(1, Number(pyRef.current.getPaceMs() || 1));
    setStepMs(pace);
    runTimerRef.current = window.setInterval(() => {
      const ev = engineRef.current.step();
      if (!ev) {
        clearRunTimer();
        finishRun();
      } else if (ev.ok) {
        setCurrentStep((s) => s + 1);
      } else {
        clearRunTimer();
      }
    }, pace);
  }

  async function handleNext() {
    clearRunTimer();
    setReverseTurn(false);
    // keep output; step-by-step continues same session
    let ev = engineRef.current.step();
    if (!ev && currentStep === 0) {
      const pre = validatePythonActions(code);
      if (!pre.ok) {
        reportPreflight(pre.errors);
        return;
      }
      // Guard the async window (Pyodide load / code exec) so a Stop or world
      // switch during it cancels this step instead of mutating the new world.
      const myToken = ++runTokenRef.current;
      applyStatus({ type: 'running' });
      clearRunFeedback();
      const revealed = revealWorldObjects(world);
      // show revealed labels before first step
      setObjects(revealed.objects);
      engineRef.current.reset(revealed);
      await pyRef.current.init(engineRef.current);
      if (runTokenRef.current !== myToken) return;
      try {
        await pyRef.current.runUserCode(code); // enqueue actions only
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[UI] Python execution error', err);
        reportPythonError(err);
        return;
      }
      if (runTokenRef.current !== myToken) return;
      ev = engineRef.current.step();
    }
    if (ev && ev.ok) setCurrentStep((s) => s + 1);
  }

  function handleStop() {
    // Invalidate any in-flight run (Pyodide load / code exec / step loop) and
    // keep the current robot state on screen.
    runTokenRef.current++;
    clearRunTimer();
    setActiveLine(null);
    applyStatus({ type: 'stopped' });
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
    runTokenRef.current++; // cancel any in-flight run
    clearRunTimer();
    setReverseTurn(false);
    engineRef.current.reset(world);
    setRobot(world.robot);
    setObjects(world.objects);
    setWalls(world.walls);
    setCurrentStep(0);
    setOutput('');
    clearRunFeedback();
    applyStatus({ type: 'ready' });
  }

  function onWorldChanged(newWorld: World) {
    runTokenRef.current++; // cancel any in-flight run before switching worlds
    clearRunTimer();
    setReverseTurn(false);
    engineRef.current.reset(newWorld);
    setRobot(newWorld.robot);
    setObjects(newWorld.objects);
    setWalls(newWorld.walls);
    setCurrentStep(0);
    setOutput('');
    clearRunFeedback();
    applyStatus({ type: 'ready' });
  }

  return {
    robot,
    objects,
    walls,
    status,
    statusKind,
    output,
    currentStep,
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
  };
}
