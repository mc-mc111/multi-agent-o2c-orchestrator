"use client";

import React, { useState } from 'react';
import { Cpu, Database, Cloud, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

export const Header: React.FC = () => {


  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 px-6 py-3.5">
      <div className="flex items-center justify-between">
        {/* Brand & System Title */}
        <div className="flex items-center space-x-3.5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Cpu className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white">SUPERVITY O2C</h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-full">
                Operations Command Center
              </span>
            </div>
            <p className="text-xs text-slate-400">Multi-Agent Orchestration Platform</p>
          </div>
        </div>

        {/* System Health Badges & Seeder */}
        <div className="flex items-center space-x-4">
          <div className="hidden lg:flex items-center space-x-3 text-xs">
            {/* Model Badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-slate-300">Model:</span>
              <span className="font-semibold text-purple-300">gemini-3.6-flash</span>
            </div>

            {/* Neon DB Status */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-slate-300">DB:</span>
              <span className="font-semibold text-emerald-400">Neon PostgreSQL</span>
            </div>

            {/* Cloudinary Badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <Cloud className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-slate-300">Storage:</span>
              <span className="font-semibold text-sky-400">Cloudinary CDN</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
