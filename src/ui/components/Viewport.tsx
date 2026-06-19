import React from 'react';
import { Camera, Bot } from 'lucide-react';
import { createThreeScene } from '../../core/renderer/scene';
import type { World, RobotPose } from '../../core/types/types';
import { ROBOT_COLORS } from '../../core/renderer/colors';
import { useI18n } from '../i18n';

interface Props {
  world: World;
  robot: RobotPose;
  reverseTurn?: boolean;
  // How long (ms) the robot should take to glide between cells.
  stepMs?: number;
  objects?: World['objects'];
  status?: string;
  statusKind?: 'info' | 'running' | 'error';
  walls?: World['walls'];
}

export function Viewport({ world, robot, reverseTurn, stepMs, objects, status, statusKind, walls }: Props) {
  const { t } = useI18n();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const handleRef = React.useRef<ReturnType<typeof createThreeScene> | null>(null);
  // Read the latest stepMs without re-firing the robot-update effect.
  const stepMsRef = React.useRef(stepMs);
  stepMsRef.current = stepMs;

  React.useEffect(() => {
    if (!canvasRef.current) return;
    handleRef.current = createThreeScene(canvasRef.current, world);
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [world]);

  React.useEffect(() => {
    // Glide forward moves over the step interval; snap on reverse (Prev).
    const durationMs = reverseTurn ? 0 : Math.max(0, Math.min(800, stepMsRef.current ?? 0));
    handleRef.current?.updateRobot(robot, { reverse: !!reverseTurn, durationMs });
  }, [robot, reverseTurn]);

  React.useEffect(() => {
    handleRef.current?.updateObjects(objects);
  }, [objects]);

  React.useEffect(() => {
    handleRef.current?.updateWalls(walls);
  }, [walls]);

  React.useEffect(() => {
    const h = handleRef.current;
    if (!h) return;
    if (statusKind === 'error') {
      h.setRobotColor(ROBOT_COLORS.error);
    } else if (statusKind === 'running') {
      h.setRobotColor(ROBOT_COLORS.running);
    } else {
      // info or others: restore original GLB/primitive color
      (h as any).restoreRobotOriginalColor?.();
    }
  }, [statusKind]);

  // (explosion effect removed)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="viewport-toolbar">
        <button
          className="viewport-btn"
          onClick={() => handleRef.current?.resetView()}
          aria-label={t('view.reset')}
        >
          <Camera size={15} /> {t('view.reset')}
        </button>
        <button
          className="viewport-btn"
          onClick={() => handleRef.current?.setViewMode('first')}
          aria-label={t('view.first')}
        >
          <Bot size={15} /> {t('view.first')}
        </button>
      </div>
    </div>
  );
}


