"use client";

import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  available_quantity: number;
  reserved_quantity: number;
  unit_price: number;
}

export const InventoryQuickBar: React.FC = () => {
  const [skus, setSkus] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/inventory`);
      if (res.ok) {
        const data = await res.json();
        setSkus(data);
      }
    } catch (e) {
      console.error("Failed to load inventory quick bar", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Layers className="h-4 w-4 text-sky-500" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Live Neon DB Inventory Reference (Use these SKUs in test orders)
          </span>
        </div>
        <button
          onClick={fetchInventory}
          disabled={loading}
          className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
          title="Refresh Inventory Stock"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {skus.map((item) => (
          <div
            key={item.id}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-[11px] font-mono shadow-xs"
          >
            <div className="font-bold text-sky-600 dark:text-sky-400 truncate">{item.sku}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{item.name}</div>
            <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100 dark:border-slate-900">
              <span className="text-slate-700 dark:text-slate-300">${item.unit_price}</span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                item.available_quantity > 0
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
              }`}>
                {item.available_quantity} left
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
