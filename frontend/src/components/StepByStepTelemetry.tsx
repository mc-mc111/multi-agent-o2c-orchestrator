"use client";

import React, { useState } from 'react';
import { 
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, 
  FileText, ExternalLink, Activity, Eye, Layers, ShieldAlert, Check, Loader2, Code, ArrowLeft
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface StepByStepTelemetryProps {
  currentState: any;
  isExecuting: boolean;
  onResetToInput: () => void;
  onOpenExceptionModal: () => void;
  onOpenValidationErrorModal: () => void;
  onOpenAuditModal: () => void;
  onOpenInvoiceModal: () => void;
  onApproveOrder?: () => void;
}

export const StepByStepTelemetry: React.FC<StepByStepTelemetryProps> = ({
  currentState,
  isExecuting,
  onResetToInput,
  onOpenExceptionModal,
  onOpenValidationErrorModal,
  onOpenAuditModal,
  onOpenInvoiceModal,
  onApproveOrder
}) => {
  const [approving, setApproving] = useState(false);

  if (!currentState) return null;

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
    audit_logs,
    current_agent
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

  // Compute stage progression state (0: pending, 1: running, 2: completed, -1: error/exception)
  const getStageState = (stageName: string) => {
    if (stageName === 'validation') {
      if (validation_status === 'VALIDATED') return 2;
      if (validation_status === 'VALIDATION_FAILED') return -1;
      if (current_agent === 'ValidationNode' || isExecuting) return 1;
      return 0;
    }
    if (stageName === 'inventory') {
      if (inventory_status === 'INVENTORY_RESERVED') return 2;
      if (inventory_status === 'INVENTORY_EXCEPTION') return -1;
      if (current_agent === 'InventoryNode' && isExecuting) return 1;
      if (validation_status === 'VALIDATED') return 1;
      return 0;
    }
    if (stageName === 'billing') {
      if (billing_status === 'INVOICE_GENERATED') return 2;
      if (current_agent === 'BillingNode' && isExecuting) return 1;
      if (inventory_status === 'INVENTORY_RESERVED') return 1;
      return 0;
    }
    if (stageName === 'risk') {
      if (risk_status === 'LOW_RISK' || risk_status === 'MEDIUM_RISK' || risk_status === 'HIGH_RISK') return 2;
      if (current_agent === 'RiskNode' && isExecuting) return 1;
      if (billing_status === 'INVOICE_GENERATED') return 1;
      return 0;
    }
    return 0;
  };

  const stage1State = getStageState('validation');
  const stage2State = getStageState('inventory');
  const stage3State = getStageState('billing');
  const stage4State = getStageState('risk');

  return (
    <div className="space-y-4">
      {/* Stream Control Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={onResetToInput} className="text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span>New Order Input</span>
          </Button>
          <div>
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-sky-500 animate-spin" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Sequential Multi-Agent Execution</h2>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30 rounded">
                {order_id}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Step-by-step state machine transition</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
            overall_status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40' :
            overall_status === 'HELD_FOR_REVIEW' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40' :
            'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40'
          }`}>
            {overall_status}
          </span>
        </div>
      </div>

      {/* Main 2-Column Split: Stage Cards on Left, Agent Execution Inspector on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: 4 STAGE CARDS STACKED VERTICALLY */}
        <div className="lg:col-span-6 space-y-3.5">
          {/* STAGE 1: VALIDATION AGENT */}
          <Card className={`transition-all ${
            stage1State === 2 ? 'border-emerald-500/40 bg-emerald-500/5' :
            stage1State === 1 ? 'border-sky-500/50 ring-1 ring-sky-500/30' :
            stage1State === -1 ? 'border-rose-500/50 bg-rose-500/5' : ''
          }`}>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-2.5">
                {stage1State === 2 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : stage1State === 1 ? (
                  <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />
                ) : stage1State === -1 ? (
                  <XCircle className="h-5 w-5 text-rose-500" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                )}
                <span className="font-bold text-xs">Stage 1: Validation Agent</span>
              </div>
              {validation_status === 'VALIDATION_FAILED' && (
                <Button size="sm" variant="destructive" onClick={onOpenValidationErrorModal} className="h-7 text-[11px]">
                  Fix Errors
                </Button>
              )}
            </CardHeader>
            <CardContent className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p>Customer: <strong>{customer_name || customer_id || 'Evaluating customer profile...'}</strong></p>
              {validation_errors && validation_errors.length > 0 && (
                <div className="p-2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px]">
                  {validation_errors.join(", ")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* STAGE 2: INVENTORY AGENT */}
          <Card className={`transition-all ${
            stage2State === 2 ? 'border-emerald-500/40 bg-emerald-500/5' :
            stage2State === 1 ? 'border-sky-500/50 ring-1 ring-sky-500/30' :
            stage2State === -1 ? 'border-amber-500/50 bg-amber-500/5' : ''
          }`}>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-2.5">
                {stage2State === 2 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : stage2State === 1 ? (
                  <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />
                ) : stage2State === -1 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                )}
                <span className="font-bold text-xs">Stage 2: Inventory Agent</span>
              </div>
              {inventory_status === 'INVENTORY_EXCEPTION' && (
                <Button size="sm" variant="default" onClick={onOpenExceptionModal} className="h-7 text-[11px] bg-amber-600 hover:bg-amber-500 text-white">
                  Resolve Exception
                </Button>
              )}
            </CardHeader>
            <CardContent className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
              {inventory_reservations && inventory_reservations.length > 0 ? (
                <div className="space-y-1 font-mono text-[11px]">
                  {inventory_reservations.map((res: any, idx: number) => (
                    <div key={idx} className="flex justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                      <span>{res.sku}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{res.allocated_qty} Allocated</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Querying warehouse stock levels in Neon DB...</p>
              )}
            </CardContent>
          </Card>

          {/* STAGE 3: BILLING AGENT */}
          <Card className={`transition-all ${
            stage3State === 2 ? 'border-emerald-500/40 bg-emerald-500/5' :
            stage3State === 1 ? 'border-sky-500/50 ring-1 ring-sky-500/30' : ''
          }`}>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-2.5">
                {stage3State === 2 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : stage3State === 1 ? (
                  <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                )}
                <span className="font-bold text-xs">Stage 3: Billing Agent</span>
              </div>
              {formattedPdfUrl && (
                <Button size="sm" variant="success" onClick={onOpenInvoiceModal} className="h-7 text-[11px]">
                  View Invoice PDF
                </Button>
              )}
            </CardHeader>
            <CardContent className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
              {billing_status === 'INVOICE_GENERATED' ? (
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between"><span>Subtotal:</span><span>${subtotal?.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-sky-600 dark:text-sky-400 border-t border-slate-200 dark:border-slate-800 pt-1">
                    <span>Grand Total:</span><span>${total_amount?.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400">Calculating taxes and rendering PDF invoice...</p>
              )}
            </CardContent>
          </Card>

          {/* STAGE 4: RISK AGENT */}
          <Card className={`transition-all ${
            stage4State === 2 ? 'border-emerald-500/40 bg-emerald-500/5' :
            stage4State === 1 ? 'border-sky-500/50 ring-1 ring-sky-500/30' : ''
          }`}>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-2.5">
                {stage4State === 2 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : stage4State === 1 ? (
                  <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-700" />
                )}
                <span className="font-bold text-xs">Stage 4: Risk Agent</span>
              </div>
              {risk_status && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-300 rounded">
                  Score: {risk_score}/100
                </span>
              )}
            </CardHeader>
            <CardContent className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
              {risk_flags && risk_flags.length > 0 ? (
                <div className="space-y-1 text-rose-600 dark:text-rose-400 text-[11px]">
                  {risk_flags.map((flag: string, idx: number) => (
                    <p key={idx}>• {flag}</p>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Evaluating credit exposure and high-value order flags...</p>
              )}

              {overall_status === 'HELD_FOR_REVIEW' && (
                <Button onClick={handleApprove} disabled={approving} variant="success" className="w-full text-xs font-bold">
                  <Check className="h-4 w-4 mr-1" />
                  <span>{approving ? "Approving..." : "Override Risk Flag & Approve Order"}</span>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: LIVE AGENT EXECUTION INSPECTOR */}
        <div className="lg:col-span-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b border-slate-200 dark:border-slate-800">
              <CardTitle className="text-xs font-bold flex items-center space-x-2">
                <Code className="h-4 w-4 text-sky-500" />
                <span>Agent Execution Inspector (Live Actions & Payloads)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1 font-mono text-[11px] overflow-y-auto space-y-3 bg-slate-950 text-slate-200 dark:bg-slate-950 rounded-b-2xl max-h-[480px]">
              {audit_logs && audit_logs.length > 0 ? (
                audit_logs.map((log: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded border border-slate-800 bg-slate-900/80 space-y-1">
                    <div className="flex items-center justify-between text-sky-400 font-bold">
                      <span>[{log.agent_name}]</span>
                      <span className="text-[10px] text-slate-400">{log.timestamp?.split('T')[1]?.split('.')[0] || log.timestamp}</span>
                    </div>
                    <p className="text-slate-300">{log.message}</p>
                    {log.payload && (
                      <pre className="text-[10px] text-slate-400 overflow-x-auto bg-slate-950 p-2 rounded border border-slate-800/80 mt-1">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                  <Activity className="h-8 w-8 animate-pulse mb-2" />
                  <p>Awaiting live agent telemetry event stream...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
