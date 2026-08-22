"use client";

import React, { useState, useEffect } from 'react';
import { Send, FileCode2, Mail, Sparkles, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getApiBaseUrl } from '@/lib/api';

interface Preset {
  id: string;
  label: string;
  description: string;
  input_type: 'text' | 'json';
  payload: object;
}

interface IngestionPanelProps {
  onExecute: (inputType: 'text' | 'json', textInput?: string) => void;
  isExecuting: boolean;
}

export const IngestionPanel: React.FC<IngestionPanelProps> = ({ onExecute, isExecuting }) => {
  const [activeMode, setActiveMode] = useState<'text' | 'json'>('text');
  const [textInput, setTextInput] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(true);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Load presets from backend on mount
  const loadPresets = async () => {
    setLoadingPresets(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/presets`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (e) {
      console.error('Failed to load presets', e);
    } finally {
      setLoadingPresets(false);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const applyPreset = (preset: Preset) => {
    setActivePresetId(preset.id);
    setActiveMode(preset.input_type);
    const jsonStr = JSON.stringify(preset.payload, null, 2);
    if (preset.input_type === 'json') {
      setJsonInput(jsonStr);
    } else {
      setTextInput(jsonStr);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeMode === 'text') {
      onExecute('text', textInput);
    } else {
      onExecute('json', jsonInput);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Edge Case Presets Panel ── */}
      <Card className="border-sky-200 dark:border-sky-900/50">
        <CardHeader className="py-2.5 px-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-bold flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Zap className="h-3.5 w-3.5" />
              <span>Edge Case Test Presets — Dynamic from Live DB</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={loadPresets}
                disabled={loadingPresets}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="Refresh presets"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPresets ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setPresetsOpen(v => !v)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                {presetsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardHeader>
        {presetsOpen && (
          <CardContent className="p-3">
            {loadingPresets ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Loading presets from database...</span>
              </div>
            ) : presets.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No presets available. Seed the database first.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className={`text-left p-3 rounded-xl border text-xs transition group ${
                      activePresetId === preset.id
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="font-bold text-slate-800 dark:text-slate-200 mb-1 leading-snug">
                      {preset.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {preset.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Main Input Panel ── */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-bold flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-sky-500" />
              <span>Order Ingestion — Submit a Purchase Order</span>
            </CardTitle>

            {/* Mode Selector */}
            <div className="flex space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => { setActiveMode('text'); setActivePresetId(null); }}
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
                onClick={() => { setActiveMode('json'); setActivePresetId(null); }}
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
                  onChange={(e) => { setTextInput(e.target.value); setActivePresetId(null); }}
                  placeholder={`Order Request from Customer CUST-1001\nShip to: 100 Innovation Way, Austin TX\nLine Items:\n- SKU-SERVER-01: 2 units @ $3500\n- SKU-SWITCH-04: 5 units @ $1200`}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Include customer ID (e.g. CUST-1001) and SKU codes (e.g. SKU-SERVER-01: 2 units). Or pick a preset above.
                </p>
              </div>
            )}

            {activeMode === 'json' && (
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                  Structured Order JSON Payload
                </label>
                <textarea
                  rows={10}
                  value={jsonInput}
                  onChange={(e) => { setJsonInput(e.target.value); setActivePresetId(null); }}
                  placeholder={`{\n  "customer_id": "CUST-1001",\n  "shipping_address": "100 Innovation Way, Austin TX",\n  "items": [\n    { "sku": "SKU-SERVER-01", "requested_qty": 2, "unit_price": 3500.0 }\n  ]\n}`}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Required: <code className="text-sky-400">customer_id</code>, <code className="text-sky-400">items[]</code> with <code className="text-sky-400">sku</code> &amp; <code className="text-sky-400">requested_qty</code>.
                </p>
              </div>
            )}

            <Button type="submit" disabled={isExecuting || (!textInput.trim() && !jsonInput.trim())} size="lg" className="w-full font-bold text-sm bg-sky-600 hover:bg-sky-500 text-white shadow-md">
              <Send className="h-4 w-4 mr-2" />
              <span>{isExecuting ? 'Submitting to Agent Pipeline...' : '🚀 Submit Order & Run Agents'}</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
