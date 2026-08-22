"use client";

import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle, Package } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface InventoryExceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  exceptions: Array<{
    sku: string;
    requested_qty: number;
    available_qty: number;
    shortage_qty: number;
  }>;
  onResolved: () => void;
}

export const InventoryExceptionModal: React.FC<InventoryExceptionModalProps> = ({
  isOpen,
  onClose,
  orderId,
  exceptions,
  onResolved
}) => {
  const [selectedAction, setSelectedAction] = useState<'KEEP_PARTIAL' | 'REMOVE' | 'SUBSTITUTE'>('KEEP_PARTIAL');
  const [availableSkus, setAvailableSkus] = useState<Array<{ sku: string; name: string; available_quantity: number }>>([]);
  const [chosenSubstituteSku, setChosenSubstituteSku] = useState<string>('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch(`${getApiBaseUrl()}/api/v1/inventory`)
        .then(res => res.json())
        .then(data => {
          const inStock = data.filter((item: any) => item.available_quantity > 0);
          setAvailableSkus(inStock);
          if (inStock.length > 0) {
            setChosenSubstituteSku(inStock[0].sku);
          }
        })
        .catch(e => console.error("Failed to load inventory for substitution", e));
    }
  }, [isOpen]);

  if (!isOpen || !exceptions || exceptions.length === 0) return null;

  const handleConfirmResolution = async () => {
    setResolving(true);
    try {
      const formData = new FormData();
      formData.append("order_id", orderId);
      formData.append("resolution_action", selectedAction);
      formData.append("overrides_json", JSON.stringify({
        substitute_sku: selectedAction === 'SUBSTITUTE' ? chosenSubstituteSku : null
      }));

      const res = await fetch(`${getApiBaseUrl()}/api/v1/orchestrate/resume`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        onResolved();
        onClose();
      }
    } catch (e) {
      console.error("Resolution failed", e);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <Card className="w-full max-w-lg shadow-2xl border-amber-500/40">
        <CardHeader className="bg-amber-500/10 border-b border-amber-500/20 py-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-sm font-bold text-amber-600 dark:text-amber-400">
              Inventory Stock Shortage Detected ({orderId})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            The following SKUs have stock shortages in Neon DB. Select how you wish to resolve this exception:
          </p>

          <div className="space-y-2">
            {exceptions.map((ex, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">{ex.sku}</span>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Requested: {ex.requested_qty} | Available: <strong className="text-amber-600 dark:text-amber-400">{ex.available_qty}</strong>
                  </div>
                </div>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold rounded text-[11px]">
                  Shortage: {ex.shortage_qty}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="font-bold text-slate-900 dark:text-white">Select Exception Resolution Action:</label>

            {/* Action Option 1: Soft Reserve Partial */}
            <label className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
              selectedAction === 'KEEP_PARTIAL'
                ? 'border-sky-500 bg-sky-500/10'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}>
              <input
                type="radio"
                name="action"
                checked={selectedAction === 'KEEP_PARTIAL'}
                onChange={() => setSelectedAction('KEEP_PARTIAL')}
                className="mt-0.5 text-sky-500"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Soft-Reserve Available Quantity</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allocate available quantity ({exceptions[0]?.available_qty || 0}) now and backorder remaining.
                </p>
              </div>
            </label>

            {/* Action Option 2: Substitute SKU with Dropdown Selection */}
            <label className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
              selectedAction === 'SUBSTITUTE'
                ? 'border-sky-500 bg-sky-500/10'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}>
              <input
                type="radio"
                name="action"
                checked={selectedAction === 'SUBSTITUTE'}
                onChange={() => setSelectedAction('SUBSTITUTE')}
                className="mt-0.5 text-sky-500"
              />
              <div className="w-full">
                <span className="font-bold text-slate-900 dark:text-white">Substitute with Alternate In-Stock SKU</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                  Select which alternate SKU from Neon DB to allocate instead:
                </p>
                {selectedAction === 'SUBSTITUTE' && (
                  <select
                    value={chosenSubstituteSku}
                    onChange={(e) => setChosenSubstituteSku(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs font-bold"
                  >
                    {availableSkus.map((item) => (
                      <option key={item.sku} value={item.sku}>
                        {item.sku} - {item.name} ({item.available_quantity} available)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            {/* Action Option 3: Remove Out of Stock Item */}
            <label className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
              selectedAction === 'REMOVE'
                ? 'border-sky-500 bg-sky-500/10'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
            }`}>
              <input
                type="radio"
                name="action"
                checked={selectedAction === 'REMOVE'}
                onChange={() => setSelectedAction('REMOVE')}
                className="mt-0.5 text-sky-500"
              />
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Remove Out-of-Stock Item</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Completely remove the item from the order and proceed.
                </p>
              </div>
            </label>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end space-x-2 bg-slate-50 dark:bg-slate-900/50 py-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirmResolution} disabled={resolving} className="font-bold">
            {resolving ? "Resuming Graph..." : "Confirm & Resume Orchestration"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
