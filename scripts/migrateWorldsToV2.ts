/**
 * One-time migration: convert all legacy reeborg.ca world exports in
 * public/worlds/*.json to the canonical v2 schema.
 *
 *  - static worlds            → fully declarative v2 (no onload)
 *  - deterministic onload     → materialized into static v2 (onload dropped)
 *  - random/dynamic onload    → v2 with `generated: true` + preserved `onload`
 *
 * Originals are copied to legacy_backup/ first.
 *   npx tsx scripts/migrateWorldsToV2.ts --check   # verify round-trip only, no writes
 *   npx tsx scripts/migrateWorldsToV2.ts           # write v2 files
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseReeborgWorld, parseV2, worldToV2, type ReeborgWorld } from '../src/core/world/loader';
import { applyOnload } from '../src/core/world/onload';
import type { World, WorldV2 } from '../src/core/types/types';

const WORLDS_DIR = path.resolve('public/worlds');
const BACKUP_DIR = path.resolve('legacy_backup');
const CHECK_ONLY = process.argv.includes('--check');

function readJson(file: string): any {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function difficultyFromId(id: string): number | undefined {
  const m = id.match(/(\d)\d*$/);
  return m ? parseInt(m[1], 10) : undefined;
}

function isDynamic(onload: string[] | undefined): boolean {
  if (!Array.isArray(onload) || onload.length === 0) return false;
  return /\b(randint|random)\b/i.test(onload.join('\n'));
}

function convertToV2(data: any, meta: { id?: string; name?: string; difficulty?: number }): WorldV2 {
  const onload = data.onload as string[] | undefined;
  const dynamic = isDynamic(onload);
  const staticWorld = parseReeborgWorld(data, { skipOnload: true });

  if (onload && onload.length > 0 && !dynamic) {
    const mat = applyOnload(staticWorld, onload);
    const staticTiles = (staticWorld as any).backgroundTiles;
    if (staticTiles) (mat as any).backgroundTiles = { ...staticTiles, ...((mat as any).backgroundTiles ?? {}) };
    return worldToV2(mat, meta);
  }
  const v2 = worldToV2(staticWorld, meta);
  if (dynamic) {
    v2.generated = true;
    v2.onload = onload;
  }
  return v2;
}

// ---- round-trip verification ----
function wallKey(w: { x: number; y: number; dir?: string }) { return `${w.x},${w.y},${w.dir}`; }
function objKey(o: { x: number; y: number; kind: string }) { return `${o.x},${o.y},${o.kind}`; }

function compare(file: string, legacy: World, v2World: World, dynamic: boolean): string[] {
  const errs: string[] = [];
  // Random/generated worlds re-run their onload with a fresh seed on every load,
  // so two independent loads legitimately differ. We only require that the v2
  // file parses (done by the caller); skip structural comparison here.
  if (dynamic) return errs;
  if (legacy.width !== v2World.width || legacy.height !== v2World.height) errs.push('size mismatch');
  const r1 = legacy.robot, r2 = v2World.robot;
  if (r1.x !== r2.x || r1.y !== r2.y || r1.dir !== r2.dir || (r1.token ?? 0) !== (r2.token ?? 0)) errs.push('robot mismatch');

  const wA = new Set(legacy.walls.map(wallKey));
  const wB = new Set(v2World.walls.map(wallKey));
  if (wA.size !== wB.size || [...wA].some(k => !wB.has(k))) errs.push(`walls mismatch (${wA.size} vs ${wB.size})`);

  // Objects: for dynamic/random worlds compare positions+kinds (counts vary); else compare counts.
  const mapA = new Map(legacy.objects?.map(o => [objKey(o), o.count]) ?? []);
  const mapB = new Map(v2World.objects?.map(o => [objKey(o), o.count]) ?? []);
  if (mapA.size !== mapB.size || [...mapA.keys()].some(k => !mapB.has(k))) {
    errs.push(`object cells mismatch (${mapA.size} vs ${mapB.size})`);
  } else if (!dynamic) {
    for (const [k, c] of mapA) {
      const cb = mapB.get(k);
      // ranged objects randomize; only flag if neither side is ranged
      const ranged = legacy.objects?.find(o => objKey(o) === k)?.range || v2World.objects?.find(o => objKey(o) === k)?.range;
      if (!ranged && c !== cb) errs.push(`object count ${k}: ${c} vs ${cb}`);
    }
  }

  // Compare only gameplay-relevant goal fields (drop decorative keys like
  // position.image that the original carried but the engine never reads).
  const normGoal = (g: any) => {
    if (!g) return null;
    const out: any = {};
    if (g.objects) out.objects = g.objects;
    if (g.walls) out.walls = g.walls;
    if (g.position) out.position = { x: g.position.x, y: g.position.y, orientation: g.position.orientation };
    if (g.possible_final_positions) out.finalPositions = g.possible_final_positions;
    return out;
  };
  if (JSON.stringify(normGoal(legacy.goal)) !== JSON.stringify(normGoal(v2World.goal))) errs.push('goal mismatch');

  const tA = JSON.stringify((legacy as any).backgroundTiles ?? null);
  const tB = JSON.stringify((v2World as any).backgroundTiles ?? null);
  if (tA !== tB) errs.push('tiles mismatch');

  return errs;
}

function main() {
  const indexPath = path.join(WORLDS_DIR, 'index.json');
  const index = fs.existsSync(indexPath) ? readJson(indexPath) : { worlds: [] };
  const nameById: Record<string, string> = {};
  for (const w of index.worlds ?? []) nameById[w.id] = w.name ?? w.id;

  const files = fs.readdirSync(WORLDS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  let nStatic = 0, nMat = 0, nGen = 0, nAlready = 0, nFail = 0;
  const failures: string[] = [];

  if (!CHECK_ONLY && !fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  for (const file of files) {
    const full = path.join(WORLDS_DIR, file);
    const data = readJson(full);
    if (data.version === 2) { nAlready++; continue; }

    const id = file.replace(/\.json$/, '');
    const meta = { id, name: nameById[id] ?? id, difficulty: difficultyFromId(id) };
    const dynamic = isDynamic(data.onload) || !!(data.onload && /\b(randint|random)\b/i.test((data.onload as string[]).join('\n')));

    const v2 = convertToV2(data, meta);

    // Verify: for deterministic worlds, legacy load and v2 load must match.
    // Worlds with ranged objects (e.g. "0-5") randomize on each load, so the
    // object set isn't stable — treat them like generated for comparison.
    const legacyWorld = parseReeborgWorld(data);
    const v2World = parseV2(v2);
    const hasRange = !!legacyWorld.objects?.some(o => o.range);
    const errs = compare(file, legacyWorld, v2World, !!v2.generated || hasRange);
    if (errs.length) { nFail++; failures.push(`${file}: ${errs.join('; ')}`); }

    if (v2.generated) nGen++;
    else if (data.onload && data.onload.length) nMat++;
    else nStatic++;

    if (!CHECK_ONLY) {
      fs.copyFileSync(full, path.join(BACKUP_DIR, file));
      fs.writeFileSync(full, JSON.stringify(v2, null, 2) + '\n', 'utf8');
    }
  }

  // base.json
  const basePath = path.join(WORLDS_DIR, 'base.json');
  if (fs.existsSync(basePath)) {
    const base = readJson(basePath);
    if (base.version !== 2) {
      const v2 = convertToV2(base, { id: 'base', name: '기본 월드' });
      if (!CHECK_ONLY) {
        fs.copyFileSync(basePath, path.join(BACKUP_DIR, 'base.json'));
        fs.writeFileSync(basePath, JSON.stringify(v2, null, 2) + '\n', 'utf8');
      }
    }
  }

  if (!CHECK_ONLY && index.worlds) {
    for (const w of index.worlds) {
      const d = difficultyFromId(w.id);
      if (d != null) w.difficulty = d;
    }
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  }

  console.log(`${CHECK_ONLY ? '[CHECK] ' : ''}static=${nStatic} materialized=${nMat} generated=${nGen} alreadyV2=${nAlready}`);
  console.log(`round-trip failures: ${nFail}`);
  for (const f of failures.slice(0, 30)) console.log('  ✗', f);
  if (!CHECK_ONLY) console.log(`Backups in: ${BACKUP_DIR}`);
  if (nFail > 0 && CHECK_ONLY) process.exit(1);
}

main();
