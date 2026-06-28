import React from 'react';
import { playJumpingRobotBottomLeft } from '../../../core/renderer/effects/jumpingRobot';
import { playOutcomeAudio } from '../../outcomeAudio';

interface Props {
	visible: boolean;
	title?: string;
	message?: string;
	// Short technical detail (e.g. a Python error line) shown in a muted box.
	detail?: string;
	sizePx?: number;
	confirmLabel?: string;
	onClose?: () => void;
}

export function FailurePopup({ visible, title = '실패', message = '다시 시도해보세요.', detail, sizePx = 400, confirmLabel = '확인', onClose }: Props) {
	const stopRef = React.useRef<null | { stop: () => void }>(null);
	const playedRef = React.useRef<boolean>(false);

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
			return;
		}
		if (playedRef.current) return;
		playedRef.current = true;
		void playOutcomeAudio('fail').catch(() => {});
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
				<div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{title}</div>
				<div style={{ fontSize: 17, opacity: 0.9, marginBottom: detail ? 10 : 16, lineHeight: 1.5 }}>{message}</div>
				{detail && (
					<div style={{
						fontSize: 13,
						fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
						color: '#7f1d1d',
						background: '#fef2f2',
						border: '1px solid #fecaca',
						borderRadius: 6,
						padding: '8px 10px',
						marginBottom: 16,
						textAlign: 'left',
						whiteSpace: 'pre-wrap',
						wordBreak: 'break-word'
					}}>{detail}</div>
				)}
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
					{confirmLabel}
				</button>
			</div>
		</div>
	);
}

