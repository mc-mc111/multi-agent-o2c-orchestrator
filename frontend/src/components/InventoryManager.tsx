"use client";

import React, { useState, useEffect } from 'react';
import { Layers, Plus, RefreshCw, CheckCircle2, AlertCircle, PlusCircle, Wrench } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface SKUItem {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  unit_price: number;
  available_quantity: number;
  reserved_quantity: number;
  reorder_threshold: number;
}

export const InventoryManager: React.FC = () => {
  const [skus, setSkus] = useState<SKUItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [adjustingSku, setAdjustingSku] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  // New SKU form state
  const [newSkuCode, setNewSkuCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('1500');
  const [newStock, setNewStock] = useState('50');

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/inventory`);
      if (res.ok) {
        const data = await res.json();
        setSkus(data);
      }
    } catch (e) {
      console.error("Failed to load inventory manager", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleAddSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkuCode || !newName) return;
    setAdding(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/inventory/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: newSkuCode.trim().toUpperCase(),
          name: newName.trim(),
          unit_price: parseFloat(newPrice) || 100.0,
          available_quantity: parseInt(newStock) || 0
        })
      });
      if (res.ok) {
        setNewSkuCode('');
        setNewName('');
        fetchInventory();
      }
    } catch (e) {
      console.error("Add SKU failed", e);
    } finally {
      setAdding(false);
    }
  };

  const handleQuickAddStock = async (sku: string, skuName: string, addQty: number) => {
    setAdjustingSku(sku);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/inventory/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku,
          name: skuName,
          unit_price: 100.0,
          available_quantity: addQty
        })
      });
      if (res.ok) {
        fetchInventory();
      }
    } catch (e) {
      console.error("Quick add stock failed", e);
    } finally {
      setAdjustingSku(null);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileMsg(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/reconcile-inventory`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setReconcileMsg(data.message || 'Done');
        fetchInventory();
      }
    } catch (e) {
      setReconcileMsg('Reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-sky-500" />
            <span>Neon DB Inventory Management</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">View, adjust, and add new SKUs directly into Neon PostgreSQL.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReconcile} disabled={reconciling} title="Fix orphaned reserved stock from old completed/cancelled orders">
            <Wrench className={`h-3.5 w-3.5 mr-1 ${reconciling ? 'animate-spin' : ''}`} />
            <span>Fix Reserved Stock</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchInventory} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>
      {reconcileMsg && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
          <span>✅ {reconcileMsg}</span>
          <button onClick={() => setReconcileMsg(null)} className="text-emerald-500">✕</button>
        </div>
      )}

      {/* Add New SKU Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold flex items-center space-x-1.5">
            <Plus className="h-4 w-4 text-sky-500" />
            <span>Add New Inventory SKU to Database</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={handleAddSku} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">SKU Code</label>
              <Input
                placeholder="SKU-ROUTER-09"
                value={newSkuCode}
                onChange={(e) => setNewSkuCode(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Product Name</label>
              <Input
                placeholder="Gigabit Enterprise Router"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Unit Price ($)</label>
              <Input
                type="number"
                placeholder="1500"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Stock Quantity</label>
              <Input
                type="number"
                placeholder="50"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={adding} className="w-full font-bold">
                {adding ? "Adding..." : "Add SKU to DB"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Inventory Table Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold">Available Inventory Items ({skus.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Unit Price</th>
                  <th className="p-3">Available Qty</th>
                  <th className="p-3">Reserved Qty</th>
                  <th className="p-3">Stock Status</th>
                  <th className="p-3 text-right">Quick Restock Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                      <div className="flex items-center justify-center space-x-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-sky-500" />
                        <span className="text-xs font-medium">Loading inventory data from Neon DB...</span>
                      </div>
                    </td>
                  </tr>
                ) : skus.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 font-sans">
                      No inventory SKUs found. Click &apos;Reset & Seed DB&apos; or add a new SKU.
                    </td>
                  </tr>
                ) : (
                  skus.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-3 font-bold text-sky-600 dark:text-sky-400">{item.sku}</td>
                    <td className="p-3 text-slate-800 dark:text-slate-200 font-sans font-medium">{item.name}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">${item.unit_price?.toFixed(2)}</td>
                    <td className="p-3 font-bold">{item.available_quantity}</td>
                    <td className="p-3 text-amber-500 font-bold">{item.reserved_quantity}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.available_quantity > 10
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : item.available_quantity > 0
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                      }`}>
                        {item.available_quantity > 0 ? "IN STOCK" : "OUT OF STOCK"}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1 font-sans">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={adjustingSku === item.sku}
                        onClick={() => handleQuickAddStock(item.sku, item.name, 10)}
                        className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950 h-7 px-2"
                      >
                        <PlusCircle className="h-3 w-3 mr-1" />
                        +10 Qty
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={adjustingSku === item.sku}
                        onClick={() => handleQuickAddStock(item.sku, item.name, 50)}
                        className="text-[10px] font-bold text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-50 dark:hover:bg-sky-950 h-7 px-2"
                      >
                        <PlusCircle className="h-3 w-3 mr-1" />
                        +50 Qty
                      </Button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
