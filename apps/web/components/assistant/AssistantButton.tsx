"use client";

import type { Ref } from "react";
import Image from "next/image";

export function AssistantButton({ onClick, buttonRef }: { onClick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title="Ask Sahayogi"
      aria-label="Open Sahayogi assistant"
      onClick={onClick}
      className="tap-pop fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-0 z-30 flex h-12 w-11 items-center justify-center overflow-hidden rounded-l-lg border border-r-0 border-[var(--assistant-border)] bg-[var(--surface)] shadow-lg transition-transform hover:-translate-x-0.5 screen-sm:bottom-[env(safe-area-inset-bottom,0px)] screen-sm:h-[36px] screen-sm:w-[34px]"
    >
      <Image
        src="/robot-icon.svg"
        alt=""
        width={38}
        height={40}
        className="h-8 w-auto"
        priority
      />
    </button>
  );
}
