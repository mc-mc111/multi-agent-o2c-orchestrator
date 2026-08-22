'use client';

import React, { useState } from 'react';
import { Eye, FileText, CheckCircle2, User, Package, MapPin, Sparkles } from 'lucide-react';

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface OrderItem {
  sku: string;
  requested_qty: number;
  unit_price?: number;
  sku_bbox?: BoundingBox;
  qty_bbox?: BoundingBox;
}

export interface DocumentInspectorProps {
  orderData: {
    customer_id?: string;
    customer_name?: string;
    customer_email?: string;
    shipping_address?: string;
    customer_id_bbox?: BoundingBox;
    shipping_address_bbox?: BoundingBox;
    items?: OrderItem[];
  };
  filePreviewUrl?: string | null;
}

export const DocumentInspector: React.FC<DocumentInspectorProps> = ({ orderData, filePreviewUrl }) => {
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);

  const customerIdBbox = orderData.customer_id_bbox || { ymin: 12, xmin: 10, ymax: 16, xmax: 35 };
  const addressBbox = orderData.shipping_address_bbox || { ymin: 18, xmin: 10, ymax: 26, xmax: 50 };
  const items = orderData.items || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-4">
      {/* LEFT PANEL: Document Viewport with Bounding Box Highlights */}
      <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xl">
        <div className="p-3 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-sky-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Document Visual Reference Inspector
            </span>
          </div>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-500/20">
            Bounding Box Bounding Active
          </span>
        </div>

        {/* Viewport Canvas with Highlight Overlays */}
        <div className="relative w-full aspect-[1/1.2] bg-slate-50 dark:bg-slate-950 p-4 flex items-center justify-center overflow-hidden">
          {filePreviewUrl ? (
            <iframe
              src={filePreviewUrl}
              className="w-full h-full rounded-lg border border-slate-200 dark:border-slate-800 pointer-events-none"
              title="Document Preview"
            />
          ) : (
            <div className="w-full h-full rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 flex flex-col justify-start relative shadow-inner">
              <div className="text-[10px] font-mono text-slate-400 mb-2">PURCHASE ORDER DOCUMENT PREVIEW</div>
              
              {/* Simulated PO layout text lines */}
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mb-4"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-850 rounded w-2/3 mb-2"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-850 rounded w-1/2 mb-6"></div>
              
              <div className="space-y-3 mt-4">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-4/6"></div>
              </div>
            </div>
          )}

          {/* OVERLAY BOUNDING BOXES */}
          <div className="absolute inset-4 pointer-events-none">
            {/* Customer ID Bounding Box */}
            <div
              style={{
                top: `${customerIdBbox.ymin}%`,
                left: `${customerIdBbox.xmin}%`,
                width: `${Math.max(15, customerIdBbox.xmax - customerIdBbox.xmin)}%`,
                height: `${Math.max(4, customerIdBbox.ymax - customerIdBbox.ymin)}%`,
              }}
              className={`absolute rounded border-2 transition-all duration-300 ${
                activeHighlight === 'customer'
                  ? 'border-yellow-400 bg-yellow-400/30 ring-4 ring-yellow-400/50 scale-105 z-20 shadow-lg'
                  : 'border-yellow-500/80 bg-yellow-500/10 z-10'
              }`}
            >
              <span className="absolute -top-4 left-0 text-[9px] font-bold bg-yellow-500 text-black px-1 rounded shadow">
                Customer ID
              </span>
            </div>

            {/* Shipping Address Bounding Box */}
            <div
              style={{
                top: `${addressBbox.ymin}%`,
                left: `${addressBbox.xmin}%`,
                width: `${Math.max(20, addressBbox.xmax - addressBbox.xmin)}%`,
                height: `${Math.max(5, addressBbox.ymax - addressBbox.ymin)}%`,
              }}
              className={`absolute rounded border-2 transition-all duration-300 ${
                activeHighlight === 'address'
                  ? 'border-emerald-400 bg-emerald-400/30 ring-4 ring-emerald-400/50 scale-105 z-20 shadow-lg'
                  : 'border-emerald-500/80 bg-emerald-500/10 z-10'
              }`}
            >
              <span className="absolute -top-4 left-0 text-[9px] font-bold bg-emerald-500 text-black px-1 rounded shadow">
                Address
              </span>
            </div>

            {/* Items SKUs & Quantities Bounding Boxes */}
            {items.map((item, idx) => {
              const skuBbox = item.sku_bbox || { ymin: 35 + idx * 8, xmin: 10, ymax: 39 + idx * 8, xmax: 40 };
              const qtyBbox = item.qty_bbox || { ymin: 35 + idx * 8, xmin: 45, ymax: 39 + idx * 8, xmax: 55 };

              return (
                <React.Fragment key={idx}>
                  {/* SKU Box */}
                  <div
                    style={{
                      top: `${skuBbox.ymin}%`,
                      left: `${skuBbox.xmin}%`,
                      width: `${Math.max(15, skuBbox.xmax - skuBbox.xmin)}%`,
                      height: `${Math.max(4, skuBbox.ymax - skuBbox.ymin)}%`,
                    }}
                    className={`absolute rounded border-2 transition-all duration-300 ${
                      activeHighlight === `sku-${idx}`
                        ? 'border-sky-400 bg-sky-400/30 ring-4 ring-sky-400/50 scale-105 z-20 shadow-lg'
                        : 'border-sky-500/80 bg-sky-500/10 z-10'
                    }`}
                  >
                    <span className="absolute -top-4 left-0 text-[9px] font-bold bg-sky-500 text-white px-1 rounded shadow">
                      SKU #{idx + 1}
                    </span>
                  </div>

                  {/* Quantity Box */}
                  <div
                    style={{
                      top: `${qtyBbox.ymin}%`,
                      left: `${qtyBbox.xmin}%`,
                      width: `${Math.max(8, qtyBbox.xmax - qtyBbox.xmin)}%`,
                      height: `${Math.max(4, qtyBbox.ymax - qtyBbox.ymin)}%`,
                    }}
                    className={`absolute rounded border-2 transition-all duration-300 ${
                      activeHighlight === `qty-${idx}`
                        ? 'border-purple-400 bg-purple-400/30 ring-4 ring-purple-400/50 scale-105 z-20 shadow-lg'
                        : 'border-purple-500/80 bg-purple-500/10 z-10'
                    }`}
                  >
                    <span className="absolute -top-4 left-0 text-[9px] font-bold bg-purple-500 text-white px-1 rounded shadow">
                      Qty #{idx + 1}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Interactive Extracted Data Reference Card */}
      <div className="lg:col-span-6 space-y-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Extracted Fields (Hover to Highlight Reference)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">Dual-Panel Inspector</span>
          </div>

          {/* Customer Profile Field */}
          <div
            onMouseEnter={() => setActiveHighlight('customer')}
            onMouseLeave={() => setActiveHighlight(null)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeHighlight === 'customer'
                ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/40 shadow-md ring-2 ring-yellow-500/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-yellow-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Customer Identifier</span>
              </div>
              <span className="text-[10px] font-bold text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/60 px-2 py-0.5 rounded">
                🟨 Visual Box
              </span>
            </div>
            <p className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">
              {orderData.customer_id || 'N/A'}
            </p>
          </div>

          {/* Shipping Address Field */}
          <div
            onMouseEnter={() => setActiveHighlight('address')}
            onMouseLeave={() => setActiveHighlight(null)}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${
              activeHighlight === 'address'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-md ring-2 ring-emerald-500/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-emerald-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Shipping Destination</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded">
                🟩 Visual Box
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 mt-1">
              {orderData.shipping_address || 'No shipping address provided'}
            </p>
          </div>

          {/* Line Items Reference Table */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Extracted Line Items
            </span>

            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
              >
                {/* SKU Reference */}
                <div
                  onMouseEnter={() => setActiveHighlight(`sku-${idx}`)}
                  onMouseLeave={() => setActiveHighlight(null)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    activeHighlight === `sku-${idx}`
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50 ring-2 ring-sky-500/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-400'
                  }`}
                >
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 block">SKU Code</span>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{item.sku}</span>
                </div>

                {/* Quantity Reference */}
                <div
                  onMouseEnter={() => setActiveHighlight(`qty-${idx}`)}
                  onMouseLeave={() => setActiveHighlight(null)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    activeHighlight === `qty-${idx}`
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/50 ring-2 ring-purple-500/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-purple-400'
                  }`}
                >
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block">Requested Qty</span>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{item.requested_qty} units</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
