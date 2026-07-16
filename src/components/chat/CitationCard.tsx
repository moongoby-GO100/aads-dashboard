"use client";
/**
 * AADS-185-C3: CitationCard — Gemini Search Grounding 인용 카드
 * groundingChunks → 카드 형태 (title + URL + 인용 텍스트), 최대 5개
 */
interface Citation {
  index: number;
  title: string;
  url: string;
  snippet?: string;
  age?: string;
}

interface CitationCardProps {
  citations: Citation[];
}

export default function CitationCard({ citations }: CitationCardProps) {
  if (!citations || citations.length === 0) return null;

  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  return (
    <div className="mt-3">
      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary, #888)" }}>
        🔍 출처 {citations.length}개
      </p>
      <div className="flex flex-col gap-2">
        {citations.slice(0, 5).map((c) => (
          <a
            key={c.index}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg px-3 py-2 text-xs transition-all hover:opacity-80"
            style={{
              background: "var(--bg-secondary, #1e1e2e)",
              border: "1px solid var(--border, #3a3a4a)",
              textDecoration: "none",
              color: "var(--text-primary, #fff)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <img
                src={`https://www.google.com/s2/favicons?domain=${getDomain(c.url)}&sz=16`}
                alt=""
                width={14}
                height={14}
                className="rounded-sm flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span
                className="font-medium truncate"
                style={{ color: "var(--accent, #6366f1)" }}
              >
                {c.title || getDomain(c.url)}
              </span>
              {c.age && (
                <span className="ml-auto flex-shrink-0 opacity-50 text-xs">{c.age}</span>
              )}
            </div>
            {c.snippet && (
              <p className="opacity-70 leading-relaxed line-clamp-2">{c.snippet}</p>
            )}
            <p className="mt-1 opacity-40 truncate">{getDomain(c.url)}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
