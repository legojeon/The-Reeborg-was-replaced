import React from 'react';
import type { World, Direction } from '../../core/types/types';
import { objectGlyph } from '../components/icons/ObjectIcon';
import { isObjectKind } from '../../core/world/objectKinds';

const TILE_COLOR: Record<string, string> = {
  grass: '#86efac', pale_grass: '#d9f99d', ice: '#bae6fd', mud: '#b08968',
  water: '#60a5fa', gravel: '#d1d5db', bricks: '#f0a868'
};
const DIR_ARROW: Record<Direction, string> = { N: '▲', E: '▶', S: '▼', W: '◀' };

// A small read-only top-down rendering of a world, used in the manager preview.
export function MiniWorld({ world, max = 320 }: { world: World; max?: number }) {
  const width = Math.max(1, world.width);
  const height = Math.max(1, world.height);
  const cell = Math.max(10, Math.min(34, Math.floor(max / Math.max(width, height))));
  const W = width * cell;
  const H = height * cell;
  const left = (x: number) => (x - 1) * cell;
  const top = (y: number) => (height - y) * cell;
  const tiles = (world as any).backgroundTiles as Record<string, string> | undefined;
  const goalObjCoords = new Set(Object.keys((world.goal as any)?.objects ?? {}));
  const gp = (world.goal as any)?.position;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', borderRadius: 6 }}>
      {/* tiles */}
      {Array.from({ length: height }, (_, ry) => Array.from({ length: width }, (_, cx) => {
        const x = cx + 1, y = ry + 1;
        const tk = tiles?.[`${x},${y}`] ?? (world as any).backgroundDefault;
        return <rect key={`c${x},${y}`} x={left(x)} y={top(y)} width={cell} height={cell} fill={TILE_COLOR[tk] ?? '#ffffff'} stroke="#e5e7eb" strokeWidth={0.75} />;
      }))}

      {/* goal object cells (green dashed) */}
      {[...goalObjCoords].map((coord) => {
        const [x, y] = coord.split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return <rect key={`g${coord}`} x={left(x) + 1.5} y={top(y) + 1.5} width={cell - 3} height={cell - 3} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="3 2" />;
      })}
      {/* goal finish position */}
      {gp && Number.isFinite(gp.x) && (
        <rect x={left(Math.floor(gp.x)) + 1.5} y={top(Math.floor(gp.y)) + 1.5} width={cell - 3} height={cell - 3} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" />
      )}

      {/* objects (with count / range label) */}
      {(world.objects ?? []).filter(o => o.count > 0 && isObjectKind(o.kind)).map((o, i) => {
        const pad = cell * 0.16;
        const s = cell - pad * 2;
        const label = o.range ? `${o.range.min}~${o.range.max}` : (o.count > 1 ? String(o.count) : '');
        return (
          <g key={`o${i}`}>
            <svg x={left(o.x) + pad} y={top(o.y) + pad} width={s} height={s} viewBox="0 0 24 24">
              {objectGlyph(o.kind)}
            </svg>
            {label && (
              <text x={left(o.x) + cell - 2} y={top(o.y) + cell - 2.5} fontSize={Math.max(8, cell * 0.36)} textAnchor="end"
                fill="#111827" stroke="#ffffff" strokeWidth={Math.max(1.5, cell * 0.06)} paintOrder="stroke" fontWeight="700">{label}</text>
            )}
          </g>
        );
      })}

      {/* walls */}
      {world.walls.map((w, i) => {
        if (!w.dir) return null;
        const L = left(w.x), T = top(w.y);
        let x1 = L, y1 = T, x2 = L, y2 = T;
        if (w.dir === 'N') { x2 = L + cell; }
        else if (w.dir === 'S') { y1 = T + cell; x2 = L + cell; y2 = T + cell; }
        else if (w.dir === 'E') { x1 = L + cell; x2 = L + cell; y2 = T + cell; }
        else { y2 = T + cell; }
        return <line key={`w${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7c2d12" strokeWidth={Math.max(2, cell * 0.12)} strokeLinecap="round" />;
      })}

      {/* robot */}
      <g>
        <circle cx={left(world.robot.x) + cell / 2} cy={top(world.robot.y) + cell / 2} r={cell / 3} fill="#3b82f6" />
        <text x={left(world.robot.x) + cell / 2} y={top(world.robot.y) + cell / 2 + cell * 0.13} fontSize={cell * 0.42} textAnchor="middle" fill="#ffffff">{DIR_ARROW[world.robot.dir]}</text>
      </g>
    </svg>
  );
}
