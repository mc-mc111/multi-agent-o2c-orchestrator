'use client';

import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, XCircle, Eye, ShieldAlert, CheckCircle2, FileText, Layers, AlertTriangle, Clock } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface OrderTransaction {
  id: string;
  customer_id: string;
  status: string;
  total_amount: number;
  risk_score: number;
  created_at: string | null;
}

interface OrderDetail {
  order: {
    id: string;
    customer_id: string;
    status: string;
    raw_input_type: string;
    raw_input_url?: string;
    subtotal: number;
    tax_amount: number;
    shipping_cost: number;
    total_amount: number;
    risk_score: number;
    risk_level: string;
    created_at?: string;
    updated_at?: string;
  };
  items: Array<{
    sku: string;
    requested_qty: number;
    allocated_qty: number;
    backordered_qty: number;
    unit_price: number;
    line_total: number;
  }>;
  audit_logs: Array<{
    agent_name: string;
    status: string;
    message: string;
    payload_json?: string;
    created_at?: string;
  }>;
}

export const TransactionManager: React.FC = () => {
  const [orders, setOrders] = useState<OrderTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Inspector Modal State
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error("Failed to load transactions", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openOrderInspector = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setLoadingDetail(true);
    setOrderDetail(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/orders/${orderId}/details`);
      if (res.ok) {
        const data = await res.json();
        setOrderDetail(data);
      }
    } catch (e) {
      console.error("Failed to fetch order details", e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCancelOrder = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to cancel order ${orderId} and unreserve all allocated stock?`)) return;
    setCancelingId(orderId);
    setActionMsg(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/orders/${orderId}/cancel`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Order ${orderId} cancelled successfully! Unreserved: ${data.unreserved?.join(', ') || 'No reserved stock'}`);
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: 'CANCELLED' } : o))
        );
        fetchOrders();
        if (selectedOrderId === orderId) {
          openOrderInspector(orderId);
        }
      } else {
        setActionMsg(`Failed to cancel: ${data.detail || 'Error'}`);
      }
    } catch (e: any) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-500" />
            <span>Active Transactions & Inventory Reservation Control Bar</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click on any order row to inspect full stage details, SKU allocations, and cancellation logs.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {actionMsg && (
        <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-50 dark:bg-sky-950/40 text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-sky-500 hover:text-sky-700">✕</button>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold">Execution Transactions ({orders.length}) — Click row for details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Total ($)</th>
                  <th className="p-3">Stage Status</th>
                  <th className="p-3">Created At</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 font-sans">
                      No active transactions found. Ingest an order to see execution status.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => openOrderInspector(o.id)}
                      className={`cursor-pointer transition-colors hover:bg-sky-50/50 dark:hover:bg-slate-800/50 ${
                        selectedOrderId === o.id ? 'bg-sky-100/40 dark:bg-sky-950/30 font-semibold' : ''
                      }`}
                    >
                      <td className="p-3 font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                        <span>{o.id}</span>
                      </td>
                      <td className="p-3 text-slate-800 dark:text-slate-200 font-sans font-medium">{o.customer_id}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">${o.total_amount?.toFixed(2)}</td>
                      <td className="p-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : o.status === 'CANCELLED'
                            ? 'bg-slate-500/20 text-slate-500 dark:text-slate-400'
                            : o.status.includes('ERROR') || o.status.includes('SHORTAGE') || o.status.includes('REVIEW') || o.status.includes('DECISION')
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            : 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">{o.created_at ? new Date(o.created_at).toLocaleString() : 'N/A'}</td>
                      <td className="p-3 text-right space-x-1 font-sans">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); openOrderInspector(o.id); }}
                          className="text-[10px] font-bold h-7 px-2"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Inspect
                        </Button>
                        {o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={cancelingId === o.id}
                            onClick={(e) => handleCancelOrder(e, o.id)}
                            className="text-[10px] font-bold h-7 px-2"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            {cancelingId === o.id ? "Canceling..." : "Cancel & Free Stock"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Order Detail Modal / Inspector Panel */}
      {selectedOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono">
                    Order Details: {selectedOrderId}
                  </h3>
                  {orderDetail?.order && (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      orderDetail.order.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : orderDetail.order.status === 'CANCELLED'
                        ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    }`}>
                      {orderDetail.order.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">Customer: {orderDetail?.order?.customer_id || 'Loading...'}</p>
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold bg-slate-100 dark:bg-slate-800 h-8 w-8 rounded-full flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {loadingDetail ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-500" />
                <p className="text-xs">Fetching stage details and audit logs...</p>
              </div>
            ) : orderDetail ? (
              <div className="space-y-6">
                {/* Status Summary Banner */}
                <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
                  orderDetail.order.status === 'CANCELLED'
                    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    : orderDetail.order.status === 'COMPLETED'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                }`}>
                  <div className="font-bold text-sm mb-1 flex items-center gap-1.5">
                    {orderDetail.order.status === 'CANCELLED' ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : orderDetail.order.status === 'COMPLETED' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span>Execution Stage: {orderDetail.order.status}</span>
                  </div>
                  <p>
                    {orderDetail.order.status === 'CANCELLED'
                      ? 'This order was CANCELLED. All reserved stock allocated to this transaction has been returned back to available inventory.'
                      : orderDetail.order.status === 'COMPLETED'
                      ? 'Order completed successfully. Inventory committed and invoice generated.'
                      : `Order stopped at ${orderDetail.order.status} stage. Pending human resolution or further action.`}
                  </p>
                </div>

                {/* Key Financial Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Subtotal</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">${orderDetail.order.subtotal?.toFixed(2)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Tax Amount</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">${orderDetail.order.tax_amount?.toFixed(2)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Amount</p>
                    <p className="text-sm font-bold text-sky-600 dark:text-sky-400">${orderDetail.order.total_amount?.toFixed(2)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Risk Score</p>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{orderDetail.order.risk_score} / 100 ({orderDetail.order.risk_level})</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-sky-500" />
                    <span>Order Items & Inventory Allocation</span>
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-sans text-[10px] uppercase">
                        <tr>
                          <th className="p-2.5">SKU Code</th>
                          <th className="p-2.5 text-center">Requested</th>
                          <th className="p-2.5 text-center">Allocated</th>
                          <th className="p-2.5 text-center">Backordered</th>
                          <th className="p-2.5 text-right">Unit Price</th>
                          <th className="p-2.5 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {orderDetail.items.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center text-slate-400 font-sans">
                              No SKU items recorded.
                            </td>
                          </tr>
                        ) : (
                          orderDetail.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                              <td className="p-2.5 font-bold text-sky-600 dark:text-sky-400">{item.sku}</td>
                              <td className="p-2.5 text-center">{item.requested_qty}</td>
                              <td className="p-2.5 text-center text-emerald-600 dark:text-emerald-400 font-bold">{item.allocated_qty}</td>
                              <td className="p-2.5 text-center text-amber-600 dark:text-amber-400">{item.backordered_qty}</td>
                              <td className="p-2.5 text-right">${item.unit_price?.toFixed(2)}</td>
                              <td className="p-2.5 text-right font-bold">${item.line_total?.toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Audit Logs Stream */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-sky-500" />
                    <span>Agent Execution Audit Logs & Stage Steps</span>
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/50 max-h-60 overflow-y-auto">
                    {orderDetail.audit_logs.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs font-sans">
                        No audit logs available for this order.
                      </div>
                    ) : (
                      orderDetail.audit_logs.map((log, idx) => (
                        <div key={idx} className="p-3 text-xs flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">
                                [{log.agent_name}]
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                log.status === 'SUCCESS' || log.status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                  : log.status === 'CANCELLED'
                                  ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                                  : log.status === 'EXCEPTION'
                                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                  : 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                              }`}>
                                {log.status}
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 font-sans text-xs">{log.message}</p>
                          </div>
                          {log.created_at && (
                            <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedOrderId(null)}>
                    Close Inspector
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
