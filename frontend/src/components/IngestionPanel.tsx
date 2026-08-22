"use client";

import React, { useState } from 'react';
import { Send, FileCode2, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface IngestionPanelProps {
  onExecute: (inputType: 'text' | 'json', textInput?: string) => void;
  isExecuting: boolean;
}

const SAMPLE_EMAIL = `Order Request from Customer CUST-1001
Ship to: 100 Innovation Way, Suite 400, Austin TX 78701
Line Items:
- SKU-SERVER-01: 2 units @ $3500
- SKU-SWITCH-04: 5 units @ $1200`;

const SAMPLE_JSON = `{
  "customer_id": "CUST-1001",
  "shipping_address": "100 Innovation Way, Austin TX",
  "items": [
    { "sku": "SKU-SERVER-01", "requested_qty": 2, "unit_price": 3500.0 },
    { "sku": "SKU-SWITCH-04", "requested_qty": 5, "unit_price": 1200.0 }
  ]
}`;

export const IngestionPanel: React.FC<IngestionPanelProps> = ({ onExecute, isExecuting }) => {
  const [activeMode, setActiveMode] = useState<'text' | 'json'>('text');
  const [textInput, setTextInput] = useState(SAMPLE_EMAIL);
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeMode === 'text') {
      onExecute('text', textInput);
    } else {
      onExecute('json', jsonInput);
    }
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold flex items-center space-x-2">
            <Sparkles className="h-4 w-4 text-sky-500" />
            <span>Order Ingestion — Submit a Purchase Order</span>
          </CardTitle>

          {/* Mode Selector Tabs */}
          <div className="flex space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveMode('text')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md flex items-center space-x-1 transition ${
                activeMode === 'text'
                  ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Email / Text</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('json')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md flex items-center space-x-1 transition ${
                activeMode === 'json'
                  ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              <span>Raw JSON</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeMode === 'text' && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                Unstructured Purchase Order Text / Email
              </label>
              <textarea
                rows={8}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste purchase order email text here..."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Include customer ID (e.g. CUST-1001) and SKU codes (e.g. SKU-SERVER-01: 2 units).
              </p>
            </div>
          )}

          {activeMode === 'json' && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                Structured Order JSON Payload
              </label>
              <textarea
                rows={8}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder="Paste JSON order payload..."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Required fields: <code className="text-sky-400">customer_id</code>, <code className="text-sky-400">items[]</code> with <code className="text-sky-400">sku</code> and <code className="text-sky-400">requested_qty</code>.
              </p>
            </div>
          )}

          <Button type="submit" disabled={isExecuting} size="lg" className="w-full font-bold text-sm bg-sky-600 hover:bg-sky-500 text-white shadow-md">
            <Send className="h-4 w-4 mr-2" />
            <span>{isExecuting ? 'Parsing Order...' : '🚀 Submit Order & Run Agents'}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
