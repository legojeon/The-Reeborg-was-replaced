// Centralized color constants for renderer
// Use numeric hex for Three.js colors; use string hex for canvas/text where needed.

// Scene and lights
export const SCENE_COLORS = {
  background: '#ffffff'
};

export const LIGHT_COLORS = {
  ambient: 0xffffff,
  directional: 0xffffff,
  hemiSky: 0xffffff,
  hemiGround: 0x404040
};

// Robot primitive colors by state (GLB preserves original materials)
export const ROBOT_COLORS = {
  default: 0x3b82f6,
  running: 0x3b82f6,
  error: 0xef4444
};

// Object visuals
export const OBJECT_COLORS = {
  primitive: 0xffa500,       // actual object placeholder/primitive
  label: '#ffa500'            // actual object label (canvas text)
};

// Goal visuals (overlays/tints)
export const GOAL_COLORS = {
  overlay: 0xfca5a5,          // generic goal overlay tint (primitives, labels, wall tint)
  objectGLB: 0x607083,        // goal objects GLB gray tint
  objectLabel: '#ff1414',     // goal object label (canvas text)
  positionTile: 0x86efac      // goal position tile (light green)
};

// Walls (primitive fallback color for real walls)
export const WALL_COLORS = {
  primitive: 0x94a3b8
};


