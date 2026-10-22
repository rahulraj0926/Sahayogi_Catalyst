"use client";

export function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1" role="status" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
          style={{
            animation: "assistant-bounce 1s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
