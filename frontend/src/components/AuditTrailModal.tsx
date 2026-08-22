"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Activity, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  auditLogs: any[];
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({
  isOpen,
  onClose,
  orderId,
  auditLogs
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] w-screen h-screen top-0 left-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-slate-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Full Telemetry Audit Trail</h3>
              <p className="text-xs text-slate-400">Order: {orderId}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 space-y-3 max-h-96 overflow-y-auto pr-1">
          {auditLogs && auditLogs.length > 0 ? (
            auditLogs.map((log: any, idx: number) => (
              <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-sky-400 flex items-center gap-1.5">
                    {log.status === 'SUCCESS' && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                    {log.status === 'EXCEPTION' && <AlertCircle className="h-3.5 w-3.5 text-amber-400" />}
                    {log.status === 'ERROR' && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
                    {log.agent_name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">{log.timestamp}</span>
                </div>
                <p className="text-xs text-slate-200">{log.message}</p>
                {log.payload && (
                  <pre className="bg-slate-900 p-2 rounded text-[10px] text-slate-400 font-mono overflow-x-auto max-h-24">
                    {typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 text-center py-6">No audit logs available.</p>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) as unknown as React.ReactElement;
};
