"use client";

import React from 'react';
import { X, FileText, Download } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

interface InvoiceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  pdfUrl: string;
  htmlUrl?: string;
}

export const InvoiceViewerModal: React.FC<InvoiceViewerModalProps> = ({
  isOpen,
  onClose,
  invoiceId,
  pdfUrl,
  htmlUrl
}) => {
  if (!isOpen) return null;

  const fullPdfUrl = pdfUrl
    ? (pdfUrl.startsWith("http") ? pdfUrl : `${getApiBaseUrl()}${pdfUrl}`)
    : `${getApiBaseUrl()}/api/v1/invoices/${invoiceId}/pdf`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-4xl h-[85vh] glass-panel rounded-2xl border border-sky-500/30 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Invoice Viewer ({invoiceId})</h3>
              <p className="text-xs text-slate-400">Generated Corporate Invoice Document</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href={fullPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Embedded Iframe Viewer */}
        <div className="flex-1 bg-slate-950 p-2 relative">
          <iframe
            src={fullPdfUrl}
            className="w-full h-full rounded-xl border border-slate-800 bg-white"
            title={`Invoice ${invoiceId}`}
          />
        </div>
      </div>
    </div>
  );
};
