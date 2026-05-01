"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const games = [
  {
    id: "lamp",
    title: "Lamp Game",
    path: "/lamp",
    description: "A mathematical combinatorial game: toggle bulbs, outwit a perfect bot, and master the Hopcroft-Karp strategy.",
    icon: "💡"
  },
  {
    id: "coin",
    title: "Coin Game",
    path: "/coin",
    description: "A strategic impartial game on a grid. Place coins and trap your opponent. Powered by Sprague-Grundy theorem.",
    icon: "🪙"
  }
];

export default function ArenaHub() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center py-20 px-4 relative overflow-hidden">
      {/* Ambient glowing background from the image aesthetic */}
      <div 
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(153, 27, 27, 0.15) 0%, rgba(245, 158, 11, 0.05) 50%, transparent 100%)",
        }}
      />
      <div 
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 50% 50% at 80% 80%, rgba(245, 158, 11, 0.08) 0%, transparent 80%)",
        }}
      />

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 text-center mb-16 space-y-4"
      >
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-red-500 drop-shadow-sm">
          ITBMO Arena
        </h1>
        <p className="text-lg md:text-xl text-amber-200/70 max-w-2xl mx-auto font-medium">
          Select a challenge from the national mathematics olympiad games hub.
        </p>
      </motion.div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
        {games.map((game, i) => (
          <Link href={game.path} key={game.id} className="block group focus:outline-none">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              whileHover={{ 
                scale: 1.03, 
                boxShadow: "0 0 30px 5px rgba(245,158,11,0.2)" 
              }}
              whileTap={{ scale: 0.98 }}
              className="relative h-full bg-zinc-900/60 backdrop-blur-md border border-red-900/30 rounded-2xl p-8 overflow-hidden transition-colors group-hover:border-amber-500/50 group-hover:bg-zinc-900/80"
            >
              <div className="absolute -inset-1 bg-gradient-to-br from-amber-500/0 to-red-600/0 group-hover:from-amber-500/10 group-hover:to-red-600/10 transition-all duration-500 blur-xl" />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="text-5xl mb-6 bg-zinc-950/50 w-20 h-20 rounded-xl flex items-center justify-center border border-zinc-800 shadow-inner group-hover:border-amber-500/30 transition-colors">
                  {game.icon}
                </div>
                <h2 className="text-3xl font-bold text-zinc-100 mb-3 group-hover:text-amber-400 transition-colors">
                  {game.title}
                </h2>
                <p className="text-zinc-400 leading-relaxed flex-grow">
                  {game.description}
                </p>
                <div className="mt-8 flex items-center text-amber-500 font-semibold group-hover:text-amber-400">
                  <span>Enter Game</span>
                  <svg className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}
