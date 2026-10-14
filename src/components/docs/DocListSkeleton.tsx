export default function DocListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-1.5" data-testid="doc-list-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse rounded-md py-2 pl-3 pr-2.5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: "3px solid transparent" }}>
          <div className="h-3.5 rounded" style={{ background: "var(--bg-hover)", width: `${86 - (i % 3) * 14}%` }} />
          <div className="mt-2 flex gap-1.5">
            <div className="h-[18px] w-14 rounded" style={{ background: "var(--bg-hover)" }} />
            <div className="h-[18px] w-10 rounded" style={{ background: "var(--bg-hover)" }} />
            <div className="h-[18px] w-20 rounded" style={{ background: "var(--bg-hover)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
