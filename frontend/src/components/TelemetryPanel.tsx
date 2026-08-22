"use client";

import React, { useState } from 'react';
import { 
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, 
  FileText, ExternalLink, Activity, Eye, Layers, ShieldAlert, Check
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

interface TelemetryPanelProps {
  currentState: any;
  isExecuting: boolean;
  onOpenExceptionModal: () => void;
  onOpenValidationErrorModal: () => void;
  onOpenAuditModal: () => void;
  onOpenInvoiceModal: () => void;
  onApproveOrder?: () => void;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  currentState,
  isExecuting,
  onOpenExceptionModal,
  onOpenValidationErrorModal,
  onOpenAuditModal,
  onOpenInvoiceModal,
  onApproveOrder
}) => {
  const [approving, setApproving] = useState(false);

  if (!currentState) {
    return (
      <div className="flex flex-col items-center justify-center h-full glass-panel rounded-2xl border border-slate-800 p-8 text-center">
        <Activity className="h-12 w-12 text-slate-700 mb-3 animate-pulse" />
        <h3 className="text-sm font-bold text-slate-300">Telemetry Stream Standby</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Select an input format on the left panel and click &quot;Execute O2C Orchestrator&quot; to begin real-time multi-agent streaming.
        </p>
      </div>
    );
  }

  const {
    order_id,
    customer_id,
    customer_name,
    validation_status,
    validation_errors,
    inventory_status,
    inventory_reservations,
    billing_status,
    subtotal,
    tax_amount,
    shipping_cost,
    total_amount,
    invoice_id,
    invoice_pdf_url,
    risk_status,
    risk_score,
    risk_flags,
    overall_status,
    audit_logs
  } = currentState;

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/orders/${order_id}/approve`, { method: "POST" });
      if (res.ok && onApproveOrder) {
        onApproveOrder();
      }
    } catch (e) {
      console.error("Approve failed", e);
    } finally {
      setApproving(false);
    }
  };

  const formattedPdfUrl = invoice_pdf_url 
    ? (invoice_pdf_url.startsWith("http") ? invoice_pdf_url : `${getApiBaseUrl()}${invoice_pdf_url}`)
    : null;

  return (
    <div className="flex flex-col h-full glass-panel rounded-2xl border border-slate-800 p-5 overflow-y-auto">
      {/* Stream Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-sky-400 animate-spin" />
            <h2 className="text-base font-bold text-white">Live Multi-Agent Telemetry</h2>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded">
              {order_id}
            </span>
          </div>
          <p className="text-xs text-slate-400">SSE Event Stream • LangGraph State Machine Execution</p>
        </div>

        {/* Global Status Badge */}
        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
            overall_status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
            overall_status === 'HELD_FOR_DECISION' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' :
            overall_status === 'HELD_FOR_REVIEW' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
            'bg-sky-500/20 text-sky-300 border-sky-500/40'
          }`}>
            {overall_status}
          </span>
        </div>
      </div>

      {/* Dynamic Agent Telemetry Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-4">
        {/* STAGE 1: VALIDATION CARD */}
        <div className={`p-4 rounded-xl border transition ${
          validation_status === 'VALIDATED' ? 'bg-slate-900/90 border-emerald-500/30' :
          validation_status === 'VALIDATION_FAILED' ? 'bg-rose-950/40 border-rose-500/40' :
          'bg-slate-900/40 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-sky-400" />
              Stage 1: Validation Agent
            </span>
            {validation_status === 'VALIDATED' && (
              <span className="flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                <CheckCircle2 className="h-3 w-3 mr-1" /> VALIDATED
              </span>
            )}
            {validation_status === 'VALIDATION_FAILED' && (
              <button 
                onClick={onOpenValidationErrorModal}
                className="flex items-center text-[10px] font-semibold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded hover:bg-rose-500/30"
              >
                <XCircle className="h-3 w-3 mr-1" /> Fix Errors
              </button>
            )}
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <p>Customer: <strong className="text-slate-200">{customer_name || customer_id || 'Evaluating...'}</strong></p>
            {validation_errors && validation_errors.length > 0 && (
              <div className="mt-2 text-[11px] text-rose-400 bg-rose-950/80 p-2 rounded border border-rose-900">
                {validation_errors.join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* STAGE 2: INVENTORY CARD */}
        <div className={`p-4 rounded-xl border transition ${
          inventory_status === 'INVENTORY_RESERVED' ? 'bg-slate-900/90 border-emerald-500/30' :
          inventory_status === 'INVENTORY_EXCEPTION' ? 'bg-amber-950/40 border-amber-500/50' :
          'bg-slate-900/40 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-amber-400" />
              Stage 2: Inventory Agent
            </span>
            {inventory_status === 'INVENTORY_RESERVED' && (
              <span className="flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                <CheckCircle2 className="h-3 w-3 mr-1" /> RESERVED
              </span>
            )}
            {inventory_status === 'INVENTORY_EXCEPTION' && (
              <button 
                onClick={onOpenExceptionModal}
                className="flex items-center text-[10px] font-semibold text-amber-300 bg-amber-500/30 px-2 py-0.5 rounded hover:bg-amber-500/40 animate-pulse border border-amber-500/50"
              >
                <AlertTriangle className="h-3 w-3 mr-1 text-amber-400" /> Resolve Exception
              </button>
            )}
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            {inventory_reservations && inventory_reservations.length > 0 ? (
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {inventory_reservations.map((res: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-[11px] font-mono border-b border-slate-800 pb-0.5">
                    <span className="text-slate-300">{res.sku}:</span>
                    <span className="text-emerald-400">{res.allocated_qty} Allocated</span>
                    {res.backordered_qty > 0 && (
                      <span className="text-amber-400 font-bold">({res.backordered_qty} Backordered)</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>Checking warehouse stock in Neon DB...</p>
            )}
          </div>
        </div>

        {/* STAGE 3: BILLING CARD */}
        <div className={`p-4 rounded-xl border transition ${
          billing_status === 'INVOICE_GENERATED' ? 'bg-slate-900/90 border-emerald-500/30' :
          'bg-slate-900/40 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-sky-400" />
              Stage 3: Billing Agent
            </span>
            {billing_status === 'INVOICE_GENERATED' && (
              <span className="flex items-center text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {invoice_id}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            {billing_status === 'INVOICE_GENERATED' ? (
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between"><span>Subtotal:</span><span className="text-slate-200">${subtotal?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Tax & Shipping:</span><span className="text-slate-200">${((tax_amount || 0) + (shipping_cost || 0)).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sky-300 border-t border-slate-800 pt-1"><span>Total:</span><span>${total_amount?.toFixed(2)}</span></div>
              </div>
            ) : (
              <p>Awaiting financial calculations...</p>
            )}
          </div>
        </div>

        {/* STAGE 4: RISK CARD */}
        <div className={`p-4 rounded-xl border transition ${
          risk_status === 'LOW_RISK' ? 'bg-slate-900/90 border-emerald-500/30' :
          risk_status === 'HIGH_RISK' || overall_status === 'HELD_FOR_REVIEW' ? 'bg-rose-950/40 border-rose-500/40' :
          'bg-slate-900/40 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-purple-400" />
              Stage 4: Risk Agent
            </span>
            {risk_status && (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                risk_status === 'LOW_RISK' ? 'bg-emerald-500/20 text-emerald-300' :
                'bg-rose-500/20 text-rose-300'
              }`}>
                {risk_status} ({risk_score}/100)
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 space-y-2">
            {risk_flags && risk_flags.length > 0 ? (
              <div className="space-y-1 max-h-16 overflow-y-auto text-[10px] text-amber-300">
                {risk_flags.map((flag: string, idx: number) => (
                  <p key={idx}>• {flag}</p>
                ))}
              </div>
            ) : (
              <p>{risk_status ? "No high-risk security flags detected." : "Evaluating financial security..."}</p>
            )}

            {/* Interactive Admin Override Button for Flagged Orders */}
            {overall_status === 'HELD_FOR_REVIEW' && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="w-full py-1.5 px-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-bold text-[11px] flex items-center justify-center space-x-1 shadow transition"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{approving ? "Approving..." : "Override Risk Flag & Approve Order"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Deliverable Action & Audit Log Bar */}
      <div className="mt-auto border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onOpenAuditModal}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
        >
          <Eye className="h-4 w-4 text-sky-400" />
          <span>View Telemetry Audit Log ({audit_logs?.length || 0} events)</span>
        </button>

        {formattedPdfUrl && (
          <button
            onClick={onOpenInvoiceModal}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition"
          >
            <FileText className="h-4 w-4" />
            <span>View Invoice PDF</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
