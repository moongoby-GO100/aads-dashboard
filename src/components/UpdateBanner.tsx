'use client';

interface UpdateBannerProps {
  onRefresh: () => void;
}

export default function UpdateBanner({ onRefresh }: UpdateBannerProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
        color: 'white',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        cursor: 'pointer',
      }}
      onClick={onRefresh}
    >
      <span>🔄</span>
      <span>새 버전이 배포되었습니다. 클릭하여 업데이트하세요.</span>
      <button
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: '6px',
          color: 'white',
          padding: '4px 16px',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        새로고침
      </button>
    </div>
  );
}
