"use client";

import React, { useState } from 'react';
import { 
  Cpu, Layers, Users, History, Sun, Moon, Lock, RefreshCw, ChevronLeft, ChevronRight, Activity
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';

export type ActiveTab = 'orchestrator' | 'inventory' | 'users' | 'audit' | 'transactions';

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { id: 'orchestrator' as ActiveTab, label: 'O2C Orchestrator', icon: Cpu },
    { id: 'transactions' as ActiveTab, label: 'Transactions Control', icon: Activity },
    { id: 'inventory' as ActiveTab, label: 'Inventory (Neon DB)', icon: Layers },
    { id: 'users' as ActiveTab, label: 'User Management', icon: Users },
    { id: 'audit' as ActiveTab, label: 'Audit Log Stream', icon: History },
  ];

  return (
    <aside className={`border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col justify-between p-3 h-screen select-none transition-all duration-300 ${
      isCollapsed ? 'w-20' : 'w-64'
    }`}>
      <div className="space-y-6">
        {/* Brand & Collapse Toggle */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Cpu className="h-5 w-5" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-none truncate">SUPERVITY O2C</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">Multi-Agent Engine</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0 ml-1"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
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
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'space-x-3 px-3'} py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
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
          title={isCollapsed ? "Reset & Seed DB" : undefined}
          className={`w-full ${isCollapsed ? 'justify-center px-0' : 'justify-start space-x-2'} text-xs`}
        >
          <RefreshCw className={`h-3.5 w-3.5 text-sky-500 shrink-0 ${seeding ? 'animate-spin' : ''}`} />
          {!isCollapsed && <span className="truncate">{seeding ? 'Seeding...' : 'Reset & Seed DB'}</span>}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          title={isCollapsed ? (theme === 'dark' ? "Light Mode" : "Dark Mode") : undefined}
          className={`w-full ${isCollapsed ? 'justify-center px-0' : 'justify-start space-x-2'} text-xs`}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-4 w-4 text-amber-400 shrink-0" />
              {!isCollapsed && <span>Light Mode</span>}
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 text-indigo-500 shrink-0" />
              {!isCollapsed && <span>Dark Mode</span>}
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onLock}
          title={isCollapsed ? "Lock Session" : undefined}
          className={`w-full ${isCollapsed ? 'justify-center px-0' : 'justify-start space-x-2'} text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30`}
        >
          <Lock className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>Lock Session</span>}
        </Button>
      </div>
    </aside>
  );
};
