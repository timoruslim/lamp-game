"use client";

/**
 * GameBoard.tsx — Renders the grid of Lamp components during gameplay.
 */

import { motion } from "framer-motion";
import Lamp from "./Lamp";
import { isBitSet } from "@/src/lib/gameUtils";

export interface GameBoardProps {
  m: number;
  currentBoard: number;
  errorBulb: number | null;
  disabled: boolean;
  onLampClick: (index: number) => void;
}

export default function GameBoard({
  m,
  currentBoard,
  errorBulb,
  disabled,
  onLampClick,
}: GameBoardProps) {
  /* Pick a column count that keeps the grid looking balanced. */
  const cols = m <= 6 ? m : Math.ceil(m / 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-wrap items-center justify-center"
      style={{ maxWidth: `${cols * 8}rem` }}
    >
      {Array.from({ length: m }, (_, i) => (
        <Lamp
          key={i}
          index={i}
          isOn={isBitSet(currentBoard, i)}
          isError={errorBulb === i}
          disabled={disabled}
          onClick={() => onLampClick(i)}
        />
      ))}
    </motion.div>
  );
}
