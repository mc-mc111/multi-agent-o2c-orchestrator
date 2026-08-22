"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldAlert, Check } from 'lucide-react';

interface ValidationErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  errors: string[];
  initialCustomerId: string;
  initialAddress: string;
  onValidationCorrected: (newCustomerId: string, newAddress: string) => void;
}

export const ValidationErrorModal: React.FC<ValidationErrorModalProps> = ({
  isOpen,
  onClose,
  orderId,
  errors,
  initialCustomerId,
  initialAddress,
  onValidationCorrected
}) => {
  const [customerId, setCustomerId] = useState(initialCustomerId || "CUST-1001");
  const [address, setAddress] = useState(initialAddress || "100 Innovation Way, Austin TX");

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onValidationCorrected(customerId, address);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] w-screen h-screen top-0 left-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md glass-panel rounded-2xl border border-rose-500/40 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Validation Error Fixer</h3>
              <p className="text-xs text-rose-300">Correct master entity fields and retry validation</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 bg-rose-950/40 border border-rose-900 rounded-xl p-3 text-xs text-rose-300 space-y-1">
          {errors.map((err, idx) => (
            <p key={idx}>• {err}</p>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Customer ID</label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              placeholder="e.g. CUST-1001"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Shipping Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full h-20 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 focus:outline-none resize-none"
              placeholder="Full shipping address"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center space-x-1"
            >
              <Check className="h-4 w-4" />
              <span>Apply Fix & Re-Validate</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) as unknown as React.ReactElement;
};
