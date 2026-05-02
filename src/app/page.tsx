"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const games = [
  {
    id: "lamp",
    title: "Lamp Game",
    path: "/lamp",
    description: "Flip the switches, dodge the traps, and outwit Timo's algorithm.",
    icon: <img src="/icons/lamp_on.png" alt="Lamp Game" className="w-full h-full object-contain scale-[1.2] pb-1" />
  },
  {
    id: "coin",
    title: "Coin Game",
    path: "/coin",
    description: "Drop coins, block neighbors, and starve Timo of valid moves.",
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
  },
  {
    id: "gauntlet",
    title: "Gauntlet",
    path: "/gauntlet",
    description: "Five perfect enemies. Five one-shot battles. Prove your mastery against Timo.",
    icon: <span className="text-5xl">⚔️</span>
  }
];

export default function ArenaHub() {
  return (
    <div className="min-h-screen text-zinc-900 flex flex-col items-center justify-center py-12 pb-18 px-4 relative overflow-hidden">
      {/* Background Image with Blur */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ 
          backgroundImage: "url('/bg.png')",
          filter: "blur(5px) brightness(1.2)",
        }}
      />
      
      {/* Dark overlay for extra readability */}
      <div className="fixed inset-0 z-0 bg-black/20 pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 text-center mb-16 space-y-4"
      >
        <h1 className="text-5xl md:text-7xl drop-shadow-md font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#c23d11] to-[#f6d063] drop-shadow-[0_2px_10px_rgba(245,158,11,0.3)] uppercase">
          ITBMO Games
        </h1>
        <p className="text-lg md:text-xl text-zinc-200 max-w-2xl mx-auto font-medium drop-shadow-md">
          Challenge Timo in some of ITBMO&apos;s best custom games.
        </p>
      </motion.div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl px-4">
        {games.map((game, i) => (
          <Link href={game.path} key={game.id} className="block group focus:outline-none h-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: i * 0.01 
              }}
              whileHover={{ 
                scale: 1.04, 
                y: -8,
                boxShadow: "0 20px 50px -12px rgba(0,0,0,0.5)" 
              }}
              whileTap={{ scale: 0.98 }}
              className="relative h-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 overflow-hidden transition-colors duration-300 group-hover:border-amber-400/60 group-hover:bg-white/20 shadow-xl"
            >
              {/* Decorative hover glow */}
              <div className="absolute -inset-1 bg-gradient-to-br from-amber-500/0 to-orange-500/0 group-hover:from-amber-500/10 group-hover:to-orange-500/10 transition-all duration-500 blur-2xl" />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="mb-6 w-24 h-24 flex items-center justify-center filter drop-shadow-[0_0_12px_rgba(245,158,11,0.4)]">
                  {game.icon}
                </div>
                <h2 className="text-3xl font-bold text-white mb-3 group-hover:text-amber-400 transition-colors drop-shadow-sm">
                  {game.title}
                </h2>
                <p className="text-zinc-200 leading-relaxed flex-grow text-sm md:text-base drop-shadow-sm">
                  {game.description}
                </p>
                <div className="mt-8 flex items-center text-amber-400 font-bold tracking-wide group-hover:text-amber-300 transition-colors">
                  <span className="uppercase text-xs">Enter Game</span>
                  <svg className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
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
