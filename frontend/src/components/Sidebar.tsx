"use client";

import React from 'react';
import { 
  Cpu, Layers, Users, History, Sun, Moon, Lock, Database, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';

export type ActiveTab = 'orchestrator' | 'inventory' | 'users' | 'audit';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onLock: () => void;
  onSeed: () => void;
  seeding: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onLock,
  onSeed,
  seeding
}) => {
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { id: 'orchestrator' as ActiveTab, label: 'O2C Orchestrator', icon: Cpu },
    { id: 'inventory' as ActiveTab, label: 'Inventory (Neon DB)', icon: Layers },
    { id: 'users' as ActiveTab, label: 'User Management', icon: Users },
    { id: 'audit' as ActiveTab, label: 'Audit Log Stream', icon: History },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between p-4 h-screen select-none transition-colors">
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center space-x-3 px-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-none">SUPERVITY O2C</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">Multi-Agent Engine</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls */}
      <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
        <Button
          variant="outline"
          size="sm"
          onClick={onSeed}
          disabled={seeding}
          className="w-full justify-start space-x-2 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-sky-500 ${seeding ? 'animate-spin' : ''}`} />
          <span>{seeding ? 'Seeding DB...' : 'Reset & Seed DB'}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start space-x-2 text-xs"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-4 w-4 text-amber-400" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 text-indigo-500" />
              <span>Dark Mode</span>
            </>
          )}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={onLock}
          className="w-full justify-start space-x-2 text-xs"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>Lock App</span>
        </Button>
      </div>
    </aside>
  );
};
