"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const games = [
  {
    id: "lamp",
    title: "Lamp Game",
    path: "/lamp",
    description: "Flip the switches, dodge the traps, and outwit a flawless algorithm.",
    icon: <img src="/icons/lamp_on.png" alt="Lamp Game" className="w-full h-full object-contain scale-[1.2] pb-1" />
  },
  {
    id: "coin",
    title: "Coin Game",
    path: "/coin",
    description: "Drop coins, block neighbors, and starve the bot of valid moves.",
    icon: (
      <div
        className="w-[75%] h-[75%] rounded-full border-2 border-amber-300 flex items-center justify-center z-10"
        style={{
          background: "linear-gradient(135deg, #fef08a 0%, #f59e0b 50%, #b45309 100%)",
          boxShadow: "0 4px 6px rgba(0,0,0,0.2), inset 0 2px 4px rgba(255,255,255,0.5), 0 0 16px 3px rgba(245,158,11,0.3)",
        }}
      >
        <div className="w-[75%] h-[75%] rounded-full border border-amber-600/40 flex items-center justify-center text-amber-950 font-serif text-2xl leading-none font-bold shadow-inner">
          $
        </div>
      </div>
    )
  }
];

export default function ArenaHub() {
  return (
    <div className="min-h-screen bg-slate-50 text-zinc-900 flex flex-col items-center py-20 px-4 relative overflow-hidden">
      {/* Ambient soft background */}
      <div 
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(245,158,11,0.08) 0%, rgba(251,191,36,0.04) 50%, transparent 100%)",
        }}
      />
      <div 
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 50% 50% at 80% 80%, rgba(245,158,11,0.05) 0%, transparent 80%)",
        }}
      />

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 text-center mb-16 space-y-4"
      >
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-500 to-red-500 drop-shadow-sm">
          ITBMO Arena
        </h1>
        <p className="text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto font-medium">
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
                boxShadow: "0 8px 40px -8px rgba(245,158,11,0.2)" 
              }}
              whileTap={{ scale: 0.98 }}
              className="relative h-full bg-white/80 backdrop-blur-md border border-zinc-200 rounded-2xl p-8 overflow-hidden transition-colors group-hover:border-amber-400/60 group-hover:bg-white shadow-sm"
            >
              <div className="absolute -inset-1 bg-gradient-to-br from-amber-500/0 to-orange-500/0 group-hover:from-amber-500/5 group-hover:to-orange-500/5 transition-all duration-500 blur-xl" />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="mb-6 w-24 h-24 flex items-center justify-center">
                  {game.icon}
                </div>
                <h2 className="text-3xl font-bold text-zinc-800 mb-3 group-hover:text-amber-600 transition-colors">
                  {game.title}
                </h2>
                <p className="text-zinc-500 leading-relaxed flex-grow">
                  {game.description}
                </p>
                <div className="mt-8 flex items-center text-amber-600 font-semibold group-hover:text-amber-500">
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
