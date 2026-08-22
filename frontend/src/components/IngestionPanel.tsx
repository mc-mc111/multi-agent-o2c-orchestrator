"use client";

import React, { useState } from 'react';
import { FileText, Code, Upload, Play, CheckCircle, AlertTriangle, FileCode } from 'lucide-react';

interface IngestionPanelProps {
  onExecute: (inputType: string, textPayload: string, file: File | null) => void;
  isExecuting: boolean;
  parsedPreview: any;
}

const PRESETS = {
  standard: {
    name: "Standard In-Stock Order (Acme Corp)",
    type: "text",
    text: "Order Request from Customer CUST-1001\nShip to: 100 Innovation Way, Suite 400, Austin TX 78701\nLine Items:\n- SKU-SERVER-01: 2 units @ $3500\n- SKU-SWITCH-04: 5 units @ $1200"
  },
  partial: {
    name: "Partial Stock Shortage (Laptop SKU)",
    type: "text",
    text: "Order Request from Customer CUST-1002\nShip to: 500 Silicon Blvd, San Jose CA 95134\nLine Items:\n- SKU-LAPTOP-02: 25 units @ $2499.99 (Only 15 in stock)"
  },
  zero_stock: {
    name: "Zero Stock Exception (Curved Monitor)",
    type: "text",
    text: "Order Request from Customer CUST-1003\nShip to: 75 Freight Terminal Rd, Chicago IL 60666\nLine Items:\n- SKU-MONITOR-03: 4 units @ $899.00 (0 in stock)"
  },
  raw_json: {
    name: "Structured Raw JSON Payload",
    type: "json",
    text: JSON.stringify({
      customer_id: "CUST-1001",
      shipping_address: "100 Innovation Way, Austin TX",
      items: [
        { sku: "SKU-SERVER-01", requested_qty: 3, unit_price: 3500.0 },
        { sku: "SKU-SWITCH-04", requested_qty: 2, unit_price: 1200.0 }
      ]
    }, null, 2)
  }
};

export const IngestionPanel: React.FC<IngestionPanelProps> = ({ onExecute, isExecuting, parsedPreview }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'json' | 'file'>('text');
  const [textValue, setTextValue] = useState(PRESETS.standard.text);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handlePresetSelect = (key: keyof typeof PRESETS) => {
    const preset = PRESETS[key];
    setActiveTab(preset.type as any);
    setTextValue(preset.text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onExecute(activeTab, textValue, selectedFile);
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-2xl border border-slate-800 p-5">
      {/* Header & Preset Selector */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-sky-400" />
            Stage 0: Multi-Modal Ingestion
          </h2>
          <p className="text-xs text-slate-400">Input unstructured text, structured JSON, or upload PO files</p>
        </div>

        {/* Preset Selector */}
        <select
          onChange={(e) => handlePresetSelect(e.target.value as any)}
          className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-sky-500 focus:outline-none"
        >
          <option value="standard">Preset: In-Stock Order</option>
          <option value="partial">Preset: Partial Shortage</option>
          <option value="zero_stock">Preset: Zero Stock Exception</option>
          <option value="raw_json">Preset: Raw JSON</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 rounded-xl bg-slate-900/90 p-1 border border-slate-800 mb-4">
        <button
          onClick={() => setActiveTab('text')}
          className={`flex items-center justify-center space-x-2 flex-1 rounded-lg py-2 text-xs font-semibold transition ${
            activeTab === 'text' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Text / Email</span>
        </button>

        <button
          onClick={() => setActiveTab('json')}
          className={`flex items-center justify-center space-x-2 flex-1 rounded-lg py-2 text-xs font-semibold transition ${
            activeTab === 'json' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code className="h-3.5 w-3.5" />
          <span>Raw JSON</span>
        </button>

        <button
          onClick={() => setActiveTab('file')}
          className={`flex items-center justify-center space-x-2 flex-1 rounded-lg py-2 text-xs font-semibold transition ${
            activeTab === 'file' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload File</span>
        </button>
      </div>

      {/* Input Content Forms */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between">
        {activeTab === 'text' && (
          <div className="flex-1 mb-4">
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Paste raw email or unstructured sales order text here..."
              className="w-full h-48 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 focus:outline-none resize-none font-mono"
            />
          </div>
        )}

        {activeTab === 'json' && (
          <div className="flex-1 mb-4">
            <textarea
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder='{\n  "customer_id": "CUST-1001",\n  "items": [...]\n}'
              className="w-full h-48 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-sky-300 focus:ring-1 focus:ring-sky-500 focus:outline-none resize-none font-mono"
            />
          </div>
        )}

        {activeTab === 'file' && (
          <div className="flex-1 mb-4 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-6 bg-slate-950/40 hover:bg-slate-950/80 transition">
            <Upload className="h-8 w-8 text-sky-400 mb-2" />
            <p className="text-xs font-medium text-slate-300">Drop purchase order (PDF, PNG, JPG)</p>
            <p className="text-[11px] text-slate-500 mb-3">Tesseract OCR & pdfplumber extraction</p>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500 cursor-pointer"
            />
            {selectedFile && (
              <div className="mt-3 text-xs text-emerald-400 font-mono">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>
        )}

        {/* Trigger Execute Button */}
        <button
          type="submit"
          disabled={isExecuting}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-sky-500/25 flex items-center justify-center space-x-2 transition disabled:opacity-50 mb-4"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>{isExecuting ? "Orchestrator Running..." : "Execute O2C Orchestrator"}</span>
        </button>
      </form>

      {/* Parsed Schema Preview Card */}
      {parsedPreview && (
        <div className="mt-auto border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-sky-400" />
              Normalized Pydantic OrderRequest Payload
            </span>
            <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
              Parsed OK
            </span>
          </div>
          <pre className="bg-slate-950 p-3 rounded-lg text-[11px] text-emerald-300 font-mono overflow-x-auto max-h-36 border border-slate-800">
            {JSON.stringify(parsedPreview, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
