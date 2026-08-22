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

  // Execute Orchestrator Trigger
  const handleExecute = async (inputType: string, textPayload?: string, file?: File | null) => {
    setIsExecuting(true);
    if (activeEventSource) {
      activeEventSource.close();
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

      // Start SSE Stream
      const es = new EventSource(`${getApiBaseUrl()}/api/v1/orchestrate/stream?order_id=${data.order_id}`);
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
    } catch (err) {
      console.error("Ingestion failed", err);
      setIsExecuting(false);
    }
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

            {/* Stage 0 Ingestion vs Step-by-Step Telemetry view */}
            {!currentState ? (
              <IngestionPanel onExecute={handleExecute} isExecuting={isExecuting} />
            ) : (
              <div className="space-y-6">
                {/* DUAL-PANEL DOCUMENT INSPECTOR WITH BOUNDING BOX HIGHLIGHTS */}
                <DocumentInspector orderData={currentState} />

                {/* STEPPER TELEMETRY PROGRESS */}
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
              </div>
            )}
          </div>
        )}

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
