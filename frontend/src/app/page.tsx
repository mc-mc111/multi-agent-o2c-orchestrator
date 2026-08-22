"use client";

import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { Sidebar, ActiveTab } from '@/components/Sidebar';
import { LoginModal } from '@/components/LoginModal';
import { InventoryQuickBar } from '@/components/InventoryQuickBar';
import { IngestionPanel } from '@/components/IngestionPanel';
import { StepByStepTelemetry } from '@/components/StepByStepTelemetry';
import { DocumentInspector } from '@/components/DocumentInspector';
import { InventoryManager } from '@/components/InventoryManager';
import { UserManager } from '@/components/UserManager';
import { AuditLogsPage } from '@/components/AuditLogsPage';
import { TransactionManager } from '@/components/TransactionManager';
import { InventoryExceptionModal } from '@/components/InventoryExceptionModal';
import { ValidationErrorModal } from '@/components/ValidationErrorModal';
import { AuditTrailModal } from '@/components/AuditTrailModal';
import { InvoiceViewerModal } from '@/components/InvoiceViewerModal';
import { getApiBaseUrl } from '@/lib/api';

function MainApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('orchestrator');
  const [seeding, setSeeding] = useState(false);

  // Orchestrator State
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentState, setCurrentState] = useState<any>(null);
  const [parsedPreview, setParsedPreview] = useState<any>(null);
  const [activeEventSource, setActiveEventSource] = useState<EventSource | null>(null);
  const [activeStage, setActiveStage] = useState<'ocr' | 'agents'>('ocr');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Modals
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  useEffect(() => {
    const authStatus = localStorage.getItem('o2c_auth');
    if (authStatus === 'authenticated') {
      setIsAuthenticated(true);
    }
  }, []);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (activeEventSource) {
        activeEventSource.close();
      }
    };
  }, [activeEventSource]);

  const handleLock = () => {
    localStorage.removeItem('o2c_auth');
    setIsAuthenticated(false);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/v1/seed`, { method: "POST" });
    } catch (e) {
      console.error("Seed failed", e);
    } finally {
      setSeeding(false);
    }
  };

  // Stage 1 Ingestion Node
  const handleExecute = async (inputType: string, textPayload?: string, file?: File | null) => {
    setIsExecuting(false);
    if (file) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }

    try {
      const formData = new FormData();
      formData.append("input_type", inputType);
      if (textPayload && textPayload.trim()) {
        formData.append("raw_text", textPayload);
      }
      if (file) {
        formData.append("file", file);
      }

      const res = await fetch(`${getApiBaseUrl()}/api/v1/ingest`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        throw new Error("Ingestion node failed");
      }

      const data = await res.json();
      setParsedPreview(data.parsed_payload);
      setCurrentState(data.initial_state);
      setActiveStage('ocr'); // Show Stage 1 OCR Inspector first!
    } catch (err) {
      console.error("Ingestion failed", err);
    }
  };

  // Stage 2 Trigger Agent Execution
  const handleStartAgentExecution = () => {
    if (!currentState?.order_id) return;
    setIsExecuting(true);
    setActiveStage('agents'); // Switch to Stage 2 Agents!

    if (activeEventSource) {
      activeEventSource.close();
    }

    const es = new EventSource(`${getApiBaseUrl()}/api/v1/orchestrate/stream?order_id=${currentState.order_id}`);
    setActiveEventSource(es);

    es.addEventListener("state_update", (event: MessageEvent) => {
      try {
        const update = JSON.parse(event.data);
        setCurrentState((prev: any) => ({
          ...(prev || {}),
          ...(update.state || {})
        }));

        const status = update.state?.overall_status;
        if (status === 'COMPLETED' || status === 'HELD_FOR_REVIEW' || status === 'HELD_FOR_DECISION' || status === 'FAILED') {
          setIsExecuting(false);
          if (status === 'HELD_FOR_DECISION') {
            setIsExceptionModalOpen(true);
          }
        }
      } catch (err) {
        console.error("SSE JSON Parse Error", err);
      }
    });

    es.onerror = (err) => {
      console.error("SSE Connection Error", err);
      es.close();
      setIsExecuting(false);
    };
  };

  const handleResumeAfterException = () => {
    if (!currentState?.order_id) return;
    setIsExecuting(true);

    const es = new EventSource(`${getApiBaseUrl()}/api/v1/orchestrate/stream?order_id=${currentState.order_id}`);
    setActiveEventSource(es);

    es.addEventListener("state_update", (event: MessageEvent) => {
      try {
        const update = JSON.parse(event.data);
        setCurrentState((prev: any) => ({
          ...(prev || {}),
          ...(update.state || {})
        }));

        const status = update.state?.overall_status;
        if (status === 'COMPLETED' || status === 'HELD_FOR_REVIEW' || status === 'FAILED') {
          setIsExecuting(false);
          es.close();
        }
      } catch (err) {
        console.error("SSE Resume Parse Error", err);
      }
    });

    es.onerror = () => {
      es.close();
      setIsExecuting(false);
    };
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* Centered Passcode Login Modal */}
      {!isAuthenticated && (
        <LoginModal onLoginSuccess={() => setIsAuthenticated(true)} />
      )}

      {/* Main Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLock={handleLock}
        onSeed={handleSeed}
        seeding={seeding}
      />

      {/* Main Workspace Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'orchestrator' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Quick Live Neon DB Inventory Reference Bar */}
            <InventoryQuickBar />

            {/* Ingestion Panel when no order active */}
            {!currentState ? (
              <IngestionPanel onExecute={handleExecute} isExecuting={isExecuting} />
            ) : (
              <div className="space-y-6">
                {/* STAGED WORKFLOW HEADER BAR */}
                <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setActiveStage('ocr')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                        activeStage === 'ocr'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>Stage 1: Document OCR & Bounding Box Inspector</span>
                    </button>
                    <button
                      onClick={() => setActiveStage('agents')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                        activeStage === 'agents'
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>Stage 2: Multi-Agent Execution Telemetry</span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setCurrentState(null);
                      setParsedPreview(null);
                      setFilePreviewUrl(null);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                  >
                    Reset & Ingest New Document
                  </button>
                </div>

                {/* STAGE 1: OCR & DUAL-PANEL BOUNDING BOX INSPECTOR */}
                {activeStage === 'ocr' && (
                  <div className="space-y-6">
                    <DocumentInspector orderData={currentState} filePreviewUrl={filePreviewUrl} />

                    {/* CALL TO ACTION TO RUN MULTI-AGENT PIPELINE */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-900/40 to-indigo-900/40 border border-sky-500/30 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white">Ready to Execute Order-to-Cash Agents?</h4>
                        <p className="text-xs text-sky-200 mt-0.5">
                          Extracted fields ready. Run ValidationAgent, InventoryAgent, BillingAgent, and RiskAgent.
                        </p>
                      </div>
                      <button
                        onClick={handleStartAgentExecution}
                        disabled={isExecuting}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-xs font-bold shadow-lg hover:from-sky-400 hover:to-indigo-500 transition"
                      >
                        🚀 Run Multi-Agent Orchestrator
                      </button>
                    </div>
                  </div>
                )}

                {/* STAGE 2: STEPPER TELEMETRY & DECISION GRAPH */}
                {activeStage === 'agents' && (
                  <StepByStepTelemetry
                    currentState={currentState}
                    isExecuting={isExecuting}
                    onResetToInput={() => setCurrentState(null)}
                    onOpenExceptionModal={() => setIsExceptionModalOpen(true)}
                    onOpenValidationErrorModal={() => setIsValidationModalOpen(true)}
                    onOpenAuditModal={() => setIsAuditModalOpen(true)}
                    onOpenInvoiceModal={() => setIsInvoiceModalOpen(true)}
                    onApproveOrder={() => {
                      setCurrentState((prev: any) => ({
                        ...(prev || {}),
                        overall_status: "COMPLETED",
                        audit_logs: [
                          ...(prev?.audit_logs || []),
                          {
                            agent_name: "RiskAgent",
                            status: "SUCCESS",
                            message: "Manual Admin Approval Granted. Risk flag overridden.",
                            timestamp: new Date().toISOString()
                          }
                        ]
                      }));
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'transactions' && <TransactionManager />}
        {activeTab === 'inventory' && <InventoryManager />}
        {activeTab === 'users' && <UserManager />}
        {activeTab === 'audit' && <AuditLogsPage />}
      </main>

      {/* Interactive Modals */}
      <InventoryExceptionModal
        isOpen={isExceptionModalOpen}
        onClose={() => setIsExceptionModalOpen(false)}
        orderId={currentState?.order_id || ''}
        exceptions={currentState?.inventory_exceptions || []}
        onResolved={handleResumeAfterException}
      />

      <ValidationErrorModal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        orderId={currentState?.order_id || ''}
        errors={currentState?.validation_errors || []}
        initialCustomerId={currentState?.customer_id || 'CUST-1001'}
        initialAddress={currentState?.shipping_address || '100 Innovation Way, Austin TX'}
        onValidationCorrected={(newCust, newAddr) => {
          setCurrentState((prev: any) => ({
            ...(prev || {}),
            customer_id: newCust,
            shipping_address: newAddr,
            validation_status: "VALIDATED",
            validation_errors: []
          }));
          setIsValidationModalOpen(false);
          handleResumeAfterException();
        }}
      />

      <AuditTrailModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        orderId={currentState?.order_id || ''}
        auditLogs={currentState?.audit_logs || []}
      />

      <InvoiceViewerModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoiceId={currentState?.invoice_id || ''}
        pdfUrl={currentState?.invoice_pdf_url || ''}
        htmlUrl={currentState?.invoice_html_url || ''}
      />
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
