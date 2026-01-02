import React from 'react';
import { ConfettiOverlay } from '../ConfettiOverlay';

interface Props {
	visible: boolean;
	title?: string;
	message?: string;
	autoHideMs?: number;
	onClose?: () => void;
}

export function SuccessPopup({ visible, title = 'Success!', message = '목표를 달성했습니다.', autoHideMs = 2500, onClose }: Props) {
	const timerRef = React.useRef<number | null>(null);
	const fxLayerRef = React.useRef<HTMLDivElement | null>(null);
	const playedRef = React.useRef<boolean>(false);
	const audioRef = React.useRef<HTMLAudioElement | null>(null);

	React.useEffect(() => {
		if (!visible) return;
		if (timerRef.current) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => {
			onClose?.();
			timerRef.current = null;
		}, autoHideMs);
		return () => {
			if (timerRef.current) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [visible, autoHideMs, onClose]);

	// no effect on success
	React.useEffect(() => {
		if (!visible) {
			playedRef.current = false;
			// stop any playing audio when hidden
			try { audioRef.current?.pause(); } catch {}
			return;
		}
		if (playedRef.current) return;
		playedRef.current = true;
		try {
			const url = new URL('../../../assets/sounds/success.mp3', import.meta.url).href;
			const a = new Audio(url);
			audioRef.current = a;
			a.volume = 1.0;
			void a.play().catch(() => {});
		} catch {
			// ignore playback errors
		}
	}, [visible]);

	if (!visible) return null;

	return (
		<div
			role="dialog"
			aria-live="polite"
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
			onClick={onClose}
		>
			<ConfettiOverlay visible={visible} durationMs={autoHideMs} speed={2} />
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
					onClick={onClose}
					style={{
						background: '#3b82f6',
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
			{/* no robot overlay for success */}
		</div>
	);
}


