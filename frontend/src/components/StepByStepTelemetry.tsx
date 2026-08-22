"use client";

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, 
  FileText, ExternalLink, Activity, Eye, Layers, ShieldAlert, Check, Loader2, ArrowLeft, ChevronRight, ChevronLeft, Download
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

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
  const [activeStage, setActiveStage] = useState<number>(1);
  const [approving, setApproving] = useState(false);

  if (!currentState) return null;

  const {
    order_id,
    customer_id,
    customer_name,
    customer_email,
    shipping_address,
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

  // Compute stage progression flags
  const isStage1Done = validation_status === 'VALIDATED';
  const isStage2Done = inventory_status === 'INVENTORY_RESERVED';
  const isStage3Done = billing_status === 'INVOICE_GENERATED';
  const isStage4Done = risk_status === 'LOW_RISK' || risk_status === 'MEDIUM_RISK' || risk_status === 'HIGH_RISK';

  const stages = [
    { id: 1, title: 'Stage 1: Validation', icon: ShieldCheck, done: isStage1Done, error: validation_status === 'VALIDATION_FAILED' },
    { id: 2, title: 'Stage 2: Inventory', icon: Layers, done: isStage2Done, error: inventory_status === 'INVENTORY_EXCEPTION' },
    { id: 3, title: 'Stage 3: Billing', icon: FileText, done: isStage3Done, error: false },
    { id: 4, title: 'Stage 4: Risk Analysis', icon: ShieldAlert, done: isStage4Done, error: overall_status === 'HELD_FOR_REVIEW' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header & New Order Action Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={onResetToInput} className="text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            <span>New Order Input</span>
          </Button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Order Execution Stepper</h2>
              <span className="px-2 py-0.5 text-xs font-mono bg-sky-500/20 text-sky-600 dark:text-sky-300 font-bold border border-sky-500/30 rounded">
                {order_id}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={onOpenAuditModal} className="text-xs">
            <Eye className="h-3.5 w-3.5 mr-1" />
            <span>View Full Audit Log</span>
          </Button>

          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
            overall_status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40' :
            overall_status === 'HELD_FOR_REVIEW' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40' :
            overall_status === 'HELD_FOR_DECISION' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40' :
            'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40'
          }`}>
            {overall_status}
          </span>
        </div>
      </div>

      {/* TOP HORIZONTAL STEPPER PROGRESS BAR */}
      <div className="grid grid-cols-4 gap-2">
        {stages.map((st) => {
          const Icon = st.icon;
          const isActive = activeStage === st.id;
          return (
            <button
              key={st.id}
              onClick={() => setActiveStage(st.id)}
              className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 ${
                isActive
                  ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/30'
                  : st.done
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : st.error
                  ? 'border-rose-500/40 bg-rose-500/5'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50'
              }`}
            >
              {st.done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : st.error ? (
                <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
              ) : isActive && isExecuting ? (
                <Loader2 className="h-5 w-5 text-sky-500 animate-spin shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                  {st.id}
                </div>
              )}
              <div className="truncate">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{st.title}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {st.done ? 'Completed' : st.error ? 'Action Required' : isActive ? 'Active Stage' : 'Pending'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══ AGENT RUNNING ANIMATION BANNER ═══ */}
      {isExecuting && (
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 p-5 shadow-xl">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-sky-400 animate-pulse" />
                  </div>
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">🤖 {current_agent || 'Orchestrator'} is running...</p>
                  <p className="text-[11px] text-sky-300 mt-0.5">LLM agents are processing your order in real-time via Gemini</p>
                </div>
              </div>
              {currentState?.audit_logs?.length > 0 && (
                <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1">Latest Agent Update</p>
                  <p className="text-xs text-slate-200 font-mono leading-relaxed">
                    {currentState.audit_logs[currentState.audit_logs.length - 1]?.message || 'Processing...'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className="h-2 w-2 rounded-full bg-sky-400" style={{ animationName: 'agentBounce', animationDuration: '1.4s', animationTimingFunction: 'ease-in-out', animationDelay: `${i * 0.2}s`, animationIterationCount: 'infinite' }} />
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {stages.map(st => (
                  <div key={st.id} className="flex items-center gap-2">
                    <div className={`h-1.5 w-20 rounded-full transition-all duration-500 ${ st.done ? 'bg-emerald-500' : 'bg-white/10' }`} />
                    <span className="text-[9px] text-slate-400 font-medium">{st.title.split(': ')[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <style>{`
            @keyframes agentBounce {
              0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
              40% { transform: scale(1.2); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* SINGLE FOCUSED STAGE CARD */}
      <Card className="shadow-lg border-slate-200 dark:border-slate-800">
        {/* STAGE 1: VALIDATION */}
        {activeStage === 1 && (
          <div>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center space-x-2">
                  <ShieldCheck className="h-5 w-5 text-sky-500" />
                  <span>Stage 1: Validation Agent Verification</span>
                </CardTitle>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                  validation_status === 'VALIDATED' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-600'
                }`}>
                  {validation_status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Customer Profile</span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{customer_name || 'Unspecified Customer'}</p>
                  <p className="text-xs font-mono text-sky-600 dark:text-sky-400">{customer_id || 'N/A'}</p>
                  <p className="text-xs text-slate-500 mt-1">{customer_email || 'No email provided'}</p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Shipping Destination</span>
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 mt-2">
                    {shipping_address || 'No shipping address provided'}
                  </p>
                </div>
              </div>

              {validation_errors && validation_errors.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 space-y-2">
                  <p className="font-bold text-xs">Validation Errors Detected:</p>
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {validation_errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                  <Button size="sm" variant="destructive" onClick={onOpenValidationErrorModal} className="mt-2 text-xs font-bold">
                    Fix Validation Errors
                  </Button>
                </div>
              )}
            </CardContent>
          </div>
        )}

        {/* STAGE 2: INVENTORY */}
        {activeStage === 2 && (
          <div>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center space-x-2">
                  <Layers className="h-5 w-5 text-amber-500" />
                  <span>Stage 2: Warehouse Inventory Stock Allocation</span>
                </CardTitle>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                  inventory_status === 'INVENTORY_RESERVED' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-600'
                }`}>
                  {inventory_status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {inventory_reservations && inventory_reservations.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 font-bold uppercase text-[10px] text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Requested</th>
                        <th className="p-3">Allocated</th>
                        <th className="p-3">Backordered</th>
                        <th className="p-3">Unit Price</th>
                        <th className="p-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                      {inventory_reservations.map((res: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-3 font-bold text-sky-600 dark:text-sky-400">{res.sku}</td>
                          <td className="p-3">{res.requested_qty}</td>
                          <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">{res.allocated_qty}</td>
                          <td className="p-3 text-amber-500">{res.backordered_qty || 0}</td>
                          <td className="p-3">${res.unit_price?.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold">${res.line_total?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-4 text-center">Checking warehouse stock in Neon DB...</p>
              )}

              {inventory_status === 'INVENTORY_EXCEPTION' && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-xs text-amber-600 dark:text-amber-400">Inventory Stock Shortage Exception</p>
                    <p className="text-xs text-slate-500">Select an alternate SKU or partial allocation to resume workflow.</p>
                  </div>
                  <Button size="sm" onClick={onOpenExceptionModal} className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs">
                    Resolve Exception
                  </Button>
                </div>
              )}
            </CardContent>
          </div>
        )}

        {/* STAGE 3: BILLING */}
        {activeStage === 3 && (
          <div>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-sky-500" />
                  <span>Stage 3: Billing & Financial Calculations</span>
                </CardTitle>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                  billing_status === 'INVOICE_GENERATED' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200'
                }`}>
                  {billing_status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-xs space-y-2 max-w-md mx-auto">
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice ID:</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">{invoice_id || 'Generating...'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal:</span>
                  <span className="font-bold">${subtotal?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tax (8.25%):</span>
                  <span>${tax_amount?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Shipping Surcharge:</span>
                  <span>${shipping_cost?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-sm font-bold text-sky-600 dark:text-sky-400">
                  <span>Grand Total:</span>
                  <span>${total_amount?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              {formattedPdfUrl && (
                <div className="text-center pt-2">
                  <Button size="lg" variant="success" onClick={onOpenInvoiceModal} className="font-bold text-xs shadow-md">
                    <FileText className="h-4 w-4 mr-2" />
                    <span>View & Download Corporate Invoice PDF</span>
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </div>
        )}

        {/* STAGE 4: RISK */}
        {activeStage === 4 && (
          <div>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center space-x-2">
                  <ShieldAlert className="h-5 w-5 text-purple-500" />
                  <span>Stage 4: Risk Analysis & Credit Exposure</span>
                </CardTitle>
                {risk_status && (
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                    risk_status === 'LOW_RISK' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {risk_status} ({risk_score}/100)
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Financial Risk Assessment</span>
                {risk_flags && risk_flags.length > 0 ? (
                  <div className="space-y-1 text-xs text-rose-600 dark:text-rose-400">
                    {risk_flags.map((flag: string, idx: number) => (
                      <p key={idx}>• {flag}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    No credit exposure or high-value risk flags detected. Order safe for processing.
                  </p>
                )}
              </div>

              {overall_status === 'HELD_FOR_REVIEW' && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
                  <p className="font-bold text-xs text-rose-600 dark:text-rose-400">Order Held for Admin Review</p>
                  <Button onClick={handleApprove} disabled={approving} variant="success" size="lg" className="w-full font-bold text-xs">
                    <Check className="h-4 w-4 mr-1.5" />
                    <span>{approving ? "Approving Order..." : "Override Risk Flag & Approve Order"}</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </div>
        )}

        {/* STEPPER NAVIGATION CONTROLS */}
        <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={activeStage === 1}
            onClick={() => setActiveStage(prev => Math.max(1, prev - 1))}
            className="text-xs"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            <span>Previous Stage</span>
          </Button>

          <span className="text-xs font-mono text-slate-400">Stage {activeStage} of 4</span>

          <Button
            variant="outline"
            size="sm"
            disabled={activeStage === 4}
            onClick={() => setActiveStage(prev => Math.min(4, prev + 1))}
            className="text-xs"
          >
            <span>Next Stage</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
