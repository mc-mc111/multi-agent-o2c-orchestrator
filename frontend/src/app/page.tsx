"use client";

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { IngestionPanel } from '@/components/IngestionPanel';
import { TelemetryPanel } from '@/components/TelemetryPanel';
import { InventoryExceptionModal } from '@/components/InventoryExceptionModal';
import { ValidationErrorModal } from '@/components/ValidationErrorModal';
import { AuditTrailModal } from '@/components/AuditTrailModal';
import { InvoiceViewerModal } from '@/components/InvoiceViewerModal';

export default function Home() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentState, setCurrentState] = useState<any>(null);
  const [parsedPreview, setParsedPreview] = useState<any>(null);
  const [activeEventSource, setActiveEventSource] = useState<EventSource | null>(null);

  // Modals
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (activeEventSource) {
        activeEventSource.close();
      }
    };
  }, [activeEventSource]);

  // Execute Orchestrator Trigger
  const handleExecute = async (inputType: string, textPayload: string, file: File | null) => {
    setIsExecuting(true);
    if (activeEventSource) {
      activeEventSource.close();
    }

    try {
      // Stage 0: POST to /api/v1/ingest
      const formData = new FormData();
      formData.append("input_type", inputType);
      if (textPayload) formData.append("raw_text", textPayload);
      if (file) formData.append("file", file);

      const res = await fetch("http://localhost:8000/api/v1/ingest", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        throw new Error("Ingestion node failed");
      }

      const data = await res.json();
      setParsedPreview(data.parsed_payload);
      setCurrentState(data.initial_state);

      // Connect to SSE Stream: /api/v1/orchestrate/stream?order_id=...
      const es = new EventSource(`http://localhost:8000/api/v1/orchestrate/stream?order_id=${data.order_id}`);
      setActiveEventSource(es);

      es.addEventListener("state_update", (event: MessageEvent) => {
        try {
          const update = JSON.parse(event.data);
          setCurrentState((prev: any) => ({
            ...(prev || {}),
            ...(update.state || {})
          }));

          // If exception triggered, pause & pop modal
          if (update.state?.overall_status === "HELD_FOR_DECISION") {
            setIsExceptionModalOpen(true);
          }
          if (update.state?.overall_status === "VALIDATION_ERROR") {
            setIsValidationModalOpen(true);
          }

          if (["COMPLETED", "HELD_FOR_REVIEW", "VALIDATION_ERROR", "REJECTED"].includes(update.state?.overall_status)) {
            setIsExecuting(false);
          }
        } catch (e) {
          console.error("Error parsing SSE event", e);
        }
      });

      es.addEventListener("error", (e) => {
        console.error("SSE stream error", e);
        es.close();
        setIsExecuting(false);
      });

    } catch (err) {
      console.error("Ingestion failed", err);
      setIsExecuting(false);
    }
  };

  const handleValidationCorrected = (newCustId: string, newAddress: string) => {
    if (!currentState) return;
    // Update local state and re-trigger execution
    const updatedPayload = JSON.stringify({
      customer_id: newCustId,
      shipping_address: newAddress,
      items: currentState.input_items || []
    }, null, 2);

    handleExecute("json", updatedPayload, null);
  };

  const handleResolutionComplete = () => {
    // Resume SSE stream updates
    if (currentState?.order_id) {
      const es = new EventSource(`http://localhost:8000/api/v1/orchestrate/stream?order_id=${currentState.order_id}`);
      setActiveEventSource(es);
      es.addEventListener("state_update", (event: MessageEvent) => {
        const update = JSON.parse(event.data);
        setCurrentState((prev: any) => ({ ...(prev || {}), ...(update.state || {}) }));
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Header Bar */}
      <Header onSeedReset={() => { setCurrentState(null); setParsedPreview(null); }} />

      {/* Main Dual-Panel Layout */}
      <main className="flex-1 p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1700px] w-full mx-auto">
        {/* Left Panel: Stage 0 Multi-Modal Ingestion (5 cols) */}
        <section className="lg:col-span-5 h-[calc(100vh-100px)]">
          <IngestionPanel
            onExecute={handleExecute}
            isExecuting={isExecuting}
            parsedPreview={parsedPreview}
          />
        </section>

        {/* Right Panel: Multi-Agent Real-time Telemetry (7 cols) */}
        <section className="lg:col-span-7 h-[calc(100vh-100px)]">
          <TelemetryPanel
            currentState={currentState}
            isExecuting={isExecuting}
            onOpenExceptionModal={() => setIsExceptionModalOpen(true)}
            onOpenValidationErrorModal={() => setIsValidationModalOpen(true)}
            onOpenAuditModal={() => setIsAuditModalOpen(true)}
            onOpenInvoiceModal={() => setIsInvoiceModalOpen(true)}
          />
        </section>
      </main>

      {/* Interactive Exception & Audit Viewer Modals */}
      <InventoryExceptionModal
        isOpen={isExceptionModalOpen}
        onClose={() => setIsExceptionModalOpen(false)}
        orderId={currentState?.order_id || ""}
        exceptions={currentState?.inventory_exceptions || []}
        onResolutionComplete={handleResolutionComplete}
      />

      <ValidationErrorModal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        orderId={currentState?.order_id || ""}
        errors={currentState?.validation_errors || []}
        initialCustomerId={currentState?.customer_id || ""}
        initialAddress={currentState?.shipping_address || ""}
        onValidationCorrected={handleValidationCorrected}
      />

      <AuditTrailModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        orderId={currentState?.order_id || ""}
        auditLogs={currentState?.audit_logs || []}
      />

      <InvoiceViewerModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoiceId={currentState?.invoice_id || ""}
        pdfUrl={currentState?.invoice_pdf_url || ""}
        htmlUrl={currentState?.invoice_html_url || ""}
      />
    </div>
  );
}
