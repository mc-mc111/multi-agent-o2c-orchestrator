"use client";

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Trash2, RefreshCw, X } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

interface InventoryExceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  exceptions: any[];
  onResolutionComplete: () => void;
}

export const InventoryExceptionModal: React.FC<InventoryExceptionModalProps> = ({
  isOpen,
  onClose,
  orderId,
  exceptions,
  onResolutionComplete
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleActionSelect = (sku: string, action: string) => {
    setSelectedActions(prev => ({ ...prev, [sku]: action }));
  };

  const handleConfirmResolution = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("order_id", orderId);
      formData.append("resolution_action", "USER_OVERRIDE");
      formData.append("overrides_json", JSON.stringify(selectedActions));

      const res = await fetch(`${getApiBaseUrl()}/api/v1/orchestrate/resume`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        onResolutionComplete();
        onClose();
      }
    } catch (e) {
      console.error("Failed to submit exception resolution", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-xl glass-panel rounded-2xl border border-amber-500/40 p-6 shadow-2xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Human-in-the-Loop Inventory Exception</h3>
              <p className="text-xs text-amber-300">Order {orderId} requires manual resolution for stock shortages</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shortage Item List & Interactive Options */}
        <div className="my-5 space-y-4 max-h-80 overflow-y-auto pr-1">
          {exceptions && exceptions.length > 0 ? (
            exceptions.map((item: any, idx: number) => {
              const currentAction = selectedActions[item.sku] || "KEEP_PARTIAL";
              return (
                <div key={idx} className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{item.name || item.sku}</h4>
                      <p className="text-[11px] font-mono text-slate-400">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-rose-400 font-bold">
                        Requested: {item.requested_qty} | Available: {item.available_qty}
                      </span>
                    </div>
                  </div>

                  {/* Option Choice Buttons */}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleActionSelect(item.sku, "KEEP_PARTIAL")}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-[11px] font-semibold transition ${
                        currentAction === "KEEP_PARTIAL"
                          ? "bg-sky-600/30 border-sky-500 text-sky-200 shadow"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <CheckCircle className="h-4 w-4 mb-1 text-sky-400" />
                      <span>Keep Available ({item.available_qty})</span>
                      <span className="text-[9px] text-slate-400 font-normal">Backorder rest</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleActionSelect(item.sku, "REMOVE")}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-[11px] font-semibold transition ${
                        currentAction === "REMOVE"
                          ? "bg-rose-600/30 border-rose-500 text-rose-200 shadow"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Trash2 className="h-4 w-4 mb-1 text-rose-400" />
                      <span>Remove Item</span>
                      <span className="text-[9px] text-slate-400 font-normal">Exclude from order</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleActionSelect(item.sku, "SUBSTITUTE")}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-[11px] font-semibold transition ${
                        currentAction === "SUBSTITUTE"
                          ? "bg-purple-600/30 border-purple-500 text-purple-200 shadow"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <RefreshCw className="h-4 w-4 mb-1 text-purple-400" />
                      <span>Substitute SKU</span>
                      <span className="text-[9px] text-slate-400 font-normal">Auto-replace SKU</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-400">No active stock exceptions.</p>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmResolution}
            disabled={submitting}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-500/20 transition flex items-center space-x-1.5"
          >
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            <span>Confirm Resolution & Resume Orchestrator</span>
          </button>
        </div>
      </div>
    </div>
  );
};
