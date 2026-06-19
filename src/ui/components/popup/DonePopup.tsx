import React from 'react';

interface Props {
	visible: boolean;
	title?: string;
	message?: string;
	confirmLabel?: string;
	onClose?: () => void;
}

export function DonePopup({ visible, title = '완료', message = '실행을 마쳤습니다.', confirmLabel = '확인', onClose }: Props) {
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
			onClick={() => onClose?.()}
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
					onClick={() => onClose?.()}
					style={{
						background: '#10b981',
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


