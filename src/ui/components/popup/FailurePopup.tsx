import React from 'react';
import { playJumpingRobotBottomLeft } from '../../../core/renderer/effects/jumpingRobot';

interface Props {
	visible: boolean;
	title?: string;
	message?: string;
	sizePx?: number;
	onClose?: () => void;
}

export function FailurePopup({ visible, title = '실패', message = '다시 시도해보세요.', sizePx = 400, onClose }: Props) {
	const stopRef = React.useRef<null | { stop: () => void }>(null);
	const playedRef = React.useRef<boolean>(false);
	const audioRef = React.useRef<HTMLAudioElement | null>(null);

	React.useEffect(() => {
		if (!visible) return;
		try {
			stopRef.current = playJumpingRobotBottomLeft(null, { loopAnim: true, sizePx });
		} catch {
			// ignore
		}
		return () => {
			try { stopRef.current?.stop?.(); } catch {}
			stopRef.current = null;
		};
	}, [visible, sizePx]);

	// one-shot fail sound when visible
	React.useEffect(() => {
		if (!visible) {
			playedRef.current = false;
			try { audioRef.current?.pause(); } catch {}
			return;
		}
		if (playedRef.current) return;
		playedRef.current = true;
		try {
			const url = new URL('../../../assets/sounds/fail.mp3', import.meta.url).href;
			const a = new Audio(url);
			audioRef.current = a;
			a.volume = 1.0;
			void a.play().catch(() => {});
		} catch {
			// ignore
		}
	}, [visible]);

	if (!visible) return null;

	return (
		<div
			role="dialog"
			aria-live="assertive"
			aria-modal="true"
			style={{
				position: 'fixed',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(0,0,0,0.28)',
				zIndex: 1000
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					minWidth: 300,
					maxWidth: '80vw',
					background: '#ffffff',
					color: '#111827',
					border: '1px solid #d1d5db',
					borderRadius: 10,
					boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
					padding: 20,
					textAlign: 'center'
				}}
			>
				<div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{title}</div>
				<div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>{message}</div>
				<button
					onClick={() => { try { stopRef.current?.stop?.(); } catch {} onClose?.(); }}
					style={{
						background: '#ef4444',
						color: '#ffffff',
						border: 'none',
						borderRadius: 6,
						padding: '8px 12px',
						cursor: 'pointer'
					}}
				>
					확인
				</button>
			</div>
		</div>
	);
}


