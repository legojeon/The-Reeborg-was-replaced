import React from 'react';
import Fireworks from 'react-canvas-confetti/dist/presets/fireworks';

interface Props {
	visible: boolean;
	durationMs?: number;
	speed?: number;
}

export function ConfettiOverlay({ visible, durationMs = 3000, speed = 5 }: Props) {
	// Auto-hide after duration (component itself can be unmounted by parent)
	const [show, setShow] = React.useState(visible);
	React.useEffect(() => {
		if (!visible) return setShow(false);
		setShow(true);
		const t = window.setTimeout(() => setShow(false), durationMs);
		return () => window.clearTimeout(t);
	}, [visible, durationMs]);

	if (!show) return null;

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 1500, // above popup backdrop and dialog
				pointerEvents: 'none'
			}}
		>
			<Fireworks autorun={{ speed }} style={{ width: '100%', height: '100%' }} />
		</div>
	);
}


