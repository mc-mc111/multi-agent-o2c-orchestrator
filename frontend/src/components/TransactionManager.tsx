'use client';

import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, XCircle, PlayCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
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

export const TransactionManager: React.FC = () => {
  const [orders, setOrders] = useState<OrderTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

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

  const handleCancelOrder = async (orderId: string) => {
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
        fetchOrders();
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
            Monitor active order execution stages and cancel transactions to unreserve held inventory stock.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {actionMsg && (
        <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-50 dark:bg-sky-950/40 text-xs font-bold text-sky-700 dark:text-sky-300">
          {actionMsg}
        </div>
      )}

      {/* Transactions List */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold">Execution Transactions ({orders.length})</CardTitle>
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
                    <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-3 font-bold text-sky-600 dark:text-sky-400">{o.id}</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200 font-sans font-medium">{o.customer_id}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">${o.total_amount?.toFixed(2)}</td>
                      <td className="p-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : o.status === 'CANCELLED'
                            ? 'bg-slate-500/20 text-slate-500'
                            : o.status.includes('ERROR') || o.status.includes('SHORTAGE') || o.status.includes('REVIEW')
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            : 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">{o.created_at ? new Date(o.created_at).toLocaleString() : 'N/A'}</td>
                      <td className="p-3 text-right space-x-1 font-sans">
                        {o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={cancelingId === o.id}
                            onClick={() => handleCancelOrder(o.id)}
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
    </div>
  );
};
