import React from 'react';
import { createThreeScene } from '../../core/renderer/scene';
import type { World, RobotPose } from '../../core/types/types';
import { ROBOT_COLORS } from '../../core/renderer/colors';

interface Props {
  world: World;
  robot: RobotPose;
  reverseTurn?: boolean;
  objects?: World['objects'];
  statusKind?: 'info' | 'running' | 'error';
  walls?: World['walls'];
}

export function Viewport({ world, robot, reverseTurn, objects, statusKind, walls }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const handleRef = React.useRef<ReturnType<typeof createThreeScene> | null>(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    handleRef.current = createThreeScene(canvasRef.current, world);
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [world]);

  React.useEffect(() => {
    handleRef.current?.updateRobot(robot, { reverse: !!reverseTurn });
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
    } else {
      h.setRobotColor(ROBOT_COLORS.running);
    }
  }, [statusKind]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <button
        onClick={() => handleRef.current?.resetView()}
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          background: '#ffffff',
          color: '#111827',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          padding: '6px 10px',
          cursor: 'pointer'
        }}
      >
        Reset View
      </button>
      <button
        onClick={() => handleRef.current?.setViewMode('first')}
        style={{
          position: 'absolute',
          left: 110,
          bottom: 8,
          background: '#ffffff',
          color: '#111827',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          padding: '6px 10px',
          cursor: 'pointer'
        }}
      >
        First Person
      </button>
    </div>
  );
}


