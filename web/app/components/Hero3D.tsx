"use client";
// Author: Subash Karki

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PhantomScene = dynamic(() => import("./PhantomScene"), {
  ssr: false,
  loading: () => <StaticFallback />,
});

const StaticFallback = () => (
  <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
    <div className="relative h-64 w-80 rounded-2xl glass overflow-hidden">
      <div className="absolute left-3 top-3 flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="absolute inset-x-6 top-12 space-y-2 font-mono text-xs">
        <div className="h-2 w-3/4 rounded bg-[var(--color-accent)]/40" />
        <div className="h-2 w-1/2 rounded bg-[var(--color-fg-subtle)]/40" />
        <div className="h-2 w-2/3 rounded bg-[var(--color-accent-violet)]/40" />
        <div className="h-2 w-1/3 rounded bg-[var(--color-fg-subtle)]/30" />
      </div>
    </div>
  </div>
);

const Hero3D = () => {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileMq = window.matchMedia("(max-width: 640px)");
    setReduceMotion(mq.matches);
    setIsMobile(mobileMq.matches);

    const onMQ = () => setReduceMotion(mq.matches);
    const onMobile = () => setIsMobile(mobileMq.matches);
    mq.addEventListener("change", onMQ);
    mobileMq.addEventListener("change", onMobile);
    return () => {
      mq.removeEventListener("change", onMQ);
      mobileMq.removeEventListener("change", onMobile);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      {reduceMotion ? <StaticFallback /> : <PhantomScene low={isMobile} />}
    </div>
  );
};

export default Hero3D;
