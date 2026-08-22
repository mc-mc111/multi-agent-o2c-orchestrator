"use client";

import React, { useState, useEffect } from 'react';
import { Send, Plus, Trash2, Sparkles, RefreshCw, ShoppingCart, User, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getApiBaseUrl } from '@/lib/api';

interface CustomerOption {
  id: string;
  name: string;
}

interface SkuOption {
  sku: string;
  name: string;
  available: number;
  price: number;
}

interface LineItem {
  id: string; // local UUID for react key
  sku: string;
  requested_qty: number;
  unit_price: number;
}

interface IngestionPanelProps {
  onExecute: (inputType: 'json', textInput: string) => void;
  isExecuting: boolean;
}

export const IngestionPanel: React.FC<IngestionPanelProps> = ({ onExecute, isExecuting }) => {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), sku: '', requested_qty: 1, unit_price: 0 }
  ]);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/presets`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
        setSkus(data.skus || []);
        // Auto-select first customer
        if (data.customers?.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(data.customers[0].id);
        }
        // Auto-fill first line item SKU
        if (data.skus?.length > 0 && lineItems[0].sku === '') {
          const firstSku = data.skus[0];
          setLineItems([{ id: lineItems[0].id, sku: firstSku.sku, requested_qty: 1, unit_price: firstSku.price }]);
        }
      }
    } catch (e) {
      console.error('Failed to load catalog', e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const skuMap = Object.fromEntries(skus.map(s => [s.sku, s]));
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // ── Line item actions ──────────────────────────────────────────────────────
  const addLine = () => {
    const firstUnused = skus.find(s => !lineItems.some(l => l.sku === s.sku));
    setLineItems(prev => [
      ...prev,
      { id: crypto.randomUUID(), sku: firstUnused?.sku || '', requested_qty: 1, unit_price: firstUnused?.price || 0 }
    ]);
  };

  const removeLine = (id: string) => {
    setLineItems(prev => prev.filter(l => l.id !== id));
  };

  const updateLine = (id: string, field: 'sku' | 'requested_qty', value: string | number) => {
    setLineItems(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (field === 'sku') {
        const skuData = skuMap[value as string];
        return { ...l, sku: value as string, unit_price: skuData?.price || 0 };
      }
      return { ...l, [field]: Number(value) };
    }));
  };

  // ── Computed totals ───────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((sum, l) => sum + (l.unit_price * l.requested_qty), 0);
  const tax = subtotal * 0.0825;
  const shipping = subtotal > 5000 ? 0 : 50;
  const total = subtotal + tax + shipping;

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;

    const validItems = lineItems.filter(l => l.sku && l.requested_qty > 0);
    if (validItems.length === 0) return;

    const customer = customers.find(c => c.id === selectedCustomerId);
    const payload = {
      customer_id: selectedCustomerId,
      shipping_address: `${customer?.name || selectedCustomerId} — Default Shipping Address`,
      items: validItems.map(l => ({
        sku: l.sku,
        requested_qty: l.requested_qty,
        unit_price: l.unit_price
      }))
    };

    onExecute('json', JSON.stringify(payload, null, 2));
  };

  const canSubmit = selectedCustomerId && lineItems.some(l => l.sku && l.requested_qty > 0) && !isExecuting;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-sky-500" />
            <span>New Purchase Order</span>
          </CardTitle>
          <button
            type="button"
            onClick={loadCatalog}
            disabled={loadingCatalog}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
            Refresh Catalog
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Customer selector ── */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              <User className="h-3.5 w-3.5" />
              Customer
            </label>
            {loadingCatalog ? (
              <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ) : customers.length === 0 ? (
              <p className="text-xs text-rose-400">No customers found — seed the database first.</p>
            ) : (
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 appearance-none cursor-pointer"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.id} — {c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* ── Line items ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                <Package className="h-3.5 w-3.5" />
                Order Line Items
              </label>
              <button
                type="button"
                onClick={addLine}
                disabled={lineItems.length >= skus.length}
                className="flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-500 disabled:opacity-40 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line
              </button>
            </div>

            {/* Table header */}
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5 text-left w-[45%]">Product / SKU</th>
                    <th className="px-3 py-2.5 text-center w-[15%]">Qty</th>
                    <th className="px-3 py-2.5 text-right w-[18%]">Unit Price</th>
                    <th className="px-3 py-2.5 text-right w-[18%]">Line Total</th>
                    <th className="px-1 py-2.5 w-[4%]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {lineItems.map((line, idx) => {
                    const skuData = skuMap[line.sku];
                    const lineTotal = line.unit_price * line.requested_qty;
                    const isOverstock = skuData && line.requested_qty > skuData.available;

                    return (
                      <tr key={line.id} className="bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                        {/* SKU dropdown */}
                        <td className="px-3 py-2">
                          <select
                            value={line.sku}
                            onChange={e => updateLine(line.id, 'sku', e.target.value)}
                            className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-[11px] focus:outline-none focus:ring-1 focus:ring-sky-500 appearance-none cursor-pointer"
                          >
                            <option value="">— Select SKU —</option>
                            {skus.map(s => (
                              <option
                                key={s.sku}
                                value={s.sku}
                                disabled={lineItems.some(l => l.id !== line.id && l.sku === s.sku)}
                              >
                                {s.sku} · {s.name} ({s.available} avail)
                              </option>
                            ))}
                          </select>
                          {isOverstock && (
                            <p className="text-[10px] text-amber-500 mt-0.5 font-medium">
                              ⚠ Only {skuData.available} in stock — will trigger backorder exception
                            </p>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={line.requested_qty}
                            onChange={e => updateLine(line.id, 'requested_qty', e.target.value)}
                            className={`w-full h-8 px-2 rounded-lg border text-center font-mono text-[12px] focus:outline-none focus:ring-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                              isOverstock
                                ? 'border-amber-400 focus:ring-amber-400'
                                : 'border-slate-200 dark:border-slate-700 focus:ring-sky-500'
                            }`}
                          />
                        </td>

                        {/* Unit price (read-only from catalog) */}
                        <td className="px-3 py-2 text-right font-mono text-[12px] text-slate-700 dark:text-slate-300">
                          {line.unit_price > 0 ? `$${line.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>

                        {/* Line total */}
                        <td className="px-3 py-2 text-right font-mono font-bold text-[12px] text-slate-800 dark:text-slate-200">
                          {lineTotal > 0 ? `$${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>

                        {/* Remove */}
                        <td className="px-1 py-2 text-center">
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(line.id)}
                              className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition rounded p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Summary footer */}
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-slate-500 font-semibold">Subtotal</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-slate-500 font-semibold">Tax (8.25%)</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">${tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-slate-500 font-semibold">
                      Shipping {subtotal > 5000 && <span className="text-emerald-500 text-[10px]">(Free over $5k)</span>}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${shipping === 0 ? 'text-emerald-500' : 'text-slate-600 dark:text-slate-400'}`}>
                      {shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}
                    </td>
                    <td />
                  </tr>
                  <tr className="border-t border-slate-300 dark:border-slate-700">
                    <td colSpan={3} className="px-3 py-2.5 text-right font-bold text-slate-800 dark:text-white text-xs">Est. Total</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-sky-600 dark:text-sky-400 text-sm">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Overstock hint */}
            {lineItems.some(l => skuMap[l.sku] && l.requested_qty > skuMap[l.sku]?.available) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400">
                ⚠ One or more items exceed available stock — order will trigger inventory exception &amp; require human resolution.
              </div>
            )}
          </div>

          {/* ── Submit ── */}
          <Button
            type="submit"
            disabled={!canSubmit}
            size="lg"
            className="w-full font-bold text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white shadow-md"
          >
            <Send className="h-4 w-4 mr-2" />
            {isExecuting ? 'Submitting to Agent Pipeline...' : '🚀 Submit Order & Run Agents'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
