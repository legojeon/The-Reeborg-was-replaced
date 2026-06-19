import { createEngine } from '../../core/engine/engine';
import { createPyBridge, validatePythonActions } from '../../core/py/pyodide';
import { normalizeWorld } from '../../core/world/loader';
import { evaluateGoalDetail, type GoalCheckItem } from '../../core/world/goal';
import type { Lang } from '../i18n';
import { makerToV2, type MakerState } from './makerModel';

export type SolutionCheckStatus =
  | 'success'      // ran cleanly and the goal is met
  | 'fail'         // ran cleanly but the goal is not met
  | 'noGoal'       // ran cleanly but this variant has no goal to check
  | 'engineError'  // the robot hit a wall / edge / had nothing to take, etc.
  | 'pyError'      // user code raised a Python error (or the too-many-actions guard)
  | 'preflight';   // a bare call without parentheses (e.g. `move` instead of `move()`)

export interface SolutionCheck {
  variant: number;            // 1-based variant index
  status: SolutionCheckStatus;
  goalItems: GoalCheckItem[]; // per-condition checklist (success/fail)
  engineReason?: string;      // engine error code (localized by reasonToMessage)
  errorLine?: number;         // 1-based line of the failing call, when known
  pyRaw?: string;             // raw Python traceback (localized by parsePythonError)
  preflightName?: string;     // bare-call name for a preflight error
}

export interface SolutionReport {
  ok: boolean;                // every variant succeeded
  checks: SolutionCheck[];
}

// Build the runnable World for a single variant by reusing the exact same
// maker→v2→World path the player uses, so validation matches real play.
function variantWorld(state: MakerState, index: number) {
  const single: MakerState = { ...state, variants: [state.variants[index]], active: 0 };
  return normalizeWorld(makerToV2(single));
}

// Run the saved solution against every variant, headlessly (no animation), and
// report whether each one reaches its goal. Pyodide loads once on the first call
// and is cached by the browser afterwards, so later runs are fast.
export async function validateSolution(state: MakerState, lang: Lang): Promise<SolutionReport> {
  const code = state.solution;
  const checks: SolutionCheck[] = [];

  // Preflight (missing parentheses) applies to the code regardless of variant.
  const pre = validatePythonActions(code);
  if (!pre.ok) {
    return {
      ok: false,
      checks: [{ variant: 0, status: 'preflight', goalItems: [], errorLine: pre.errors[0].line, preflightName: pre.errors[0].name }]
    };
  }

  const py = createPyBridge();

  for (let i = 0; i < state.variants.length; i++) {
    const world = variantWorld(state, i);
    const engine = createEngine(world);

    // init() re-points the bridge at this engine; the heavy Pyodide load only
    // happens on the first variant.
    await py.init(engine);

    try {
      await py.runUserCode(code); // enqueue actions only
    } catch (err) {
      checks.push({ variant: i + 1, status: 'pyError', goalItems: [], pyRaw: (err as any)?.message ?? String(err) });
      continue;
    }

    // Drain the queue synchronously; stop at the first failing action.
    let failure: ReturnType<typeof engine.step> | null = null;
    for (;;) {
      const ev = engine.step();
      if (!ev) break;
      if (!ev.ok) { failure = ev; break; }
    }

    if (failure) {
      checks.push({
        variant: i + 1,
        status: 'engineError',
        goalItems: [],
        engineReason: failure.reason,
        errorLine: typeof failure.action?.line === 'number' ? failure.action.line : undefined
      });
      continue;
    }

    const finalState = engine.getState();
    if (!finalState.goal) {
      checks.push({ variant: i + 1, status: 'noGoal', goalItems: [] });
      continue;
    }
    const detail = evaluateGoalDetail(finalState, finalState.goal, lang);
    checks.push({ variant: i + 1, status: detail.ok ? 'success' : 'fail', goalItems: detail.items });
  }

  const ok = checks.length > 0 && checks.every(c => c.status === 'success' || c.status === 'noGoal');
  return { ok, checks };
}
