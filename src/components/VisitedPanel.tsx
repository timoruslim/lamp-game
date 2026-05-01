"use client";

import { useEffect, useRef } from "react";
import { isBitSet } from "@/src/lib/gameUtils";
import { motion, AnimatePresence } from "framer-motion";

export interface VisitedPanelProps {
  m: number;
  visitedStates: number[];
  highlightState: number | null;
}

export default function VisitedPanel({
  m,
  visitedStates,
  highlightState,
}: VisitedPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(visitedStates.length);

  // Auto-scroll to highlighted state if it exists
  useEffect(() => {
    if (highlightState !== null && containerRef.current) {
      const el = containerRef.current.querySelector(
        `[data-state="${highlightState}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (containerRef.current && visitedStates.length > prevLenRef.current) {
      // Auto-scroll to end (works for both horizontal and vertical layouts)
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
    prevLenRef.current = visitedStates.length;
  }, [highlightState, visitedStates.length]);

  return (
    <div className="flex flex-row xl:flex-col fixed bottom-0 left-0 right-0 xl:left-auto xl:right-4 xl:top-4 xl:bottom-4 xl:w-72 h-20 xl:h-auto bg-white/95 xl:bg-white/80 backdrop-blur-md border-t xl:border border-zinc-200 xl:rounded-2xl overflow-hidden z-20 shadow-lg">
      <div className="flex-shrink-0 flex flex-col justify-center px-4 xl:p-4 border-r xl:border-r-0 xl:border-b border-zinc-200/50 bg-zinc-50/50">
        <h2 className="text-[10px] xl:text-xs uppercase tracking-widest font-semibold text-zinc-500">
          History
        </h2>
        <p className="hidden xl:block text-[10px] text-zinc-400 mt-1">
          All played moves. No state can be repeated.
        </p>
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex flex-row xl:flex-col overflow-x-auto xl:overflow-x-hidden overflow-y-hidden xl:overflow-y-auto p-3 xl:p-4 gap-3 xl:gap-0 xl:space-y-2 scroll-smooth items-center xl:items-stretch"
      >
        <AnimatePresence initial={false}>
          {visitedStates.map((state, idx) => {
            const isHighlighted = highlightState === state;
            return (
              <motion.div
                key={`${state}-${idx}`}
                data-state={state}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={[
                  "flex-shrink-0 flex items-center justify-between p-2 px-3 rounded-lg border transition-colors gap-3",
                  isHighlighted
                    ? "bg-red-50 border-red-300/60"
                    : "bg-zinc-50 border-zinc-200/60",
                ].join(" ")}
              >
                <span className="text-[10px] font-mono text-zinc-400">
                  #{idx}
                </span>

                <div className="flex gap-1">
                  {Array.from({ length: m }, (_, i) => {
                    const on = isBitSet(state, i);
                    return (
                      <div
                        key={i}
                        className={[
                          "w-2.5 h-2.5 rounded-full",
                          on
                            ? "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.4)]"
                            : "bg-zinc-300",
                        ].join(" ")}
                      />
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
