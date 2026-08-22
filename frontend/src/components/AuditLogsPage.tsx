"use client";

import React, { useState, useEffect } from 'react';
import { History, RefreshCw, Eye, FileText, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface OrderLogItem {
  id: string;
  customer_id: string;
  status: string;
  total_amount: number;
  risk_score: number;
  risk_level?: string;
  created_at?: string;
}

export const AuditLogsPage: React.FC = () => {
  const [orders, setOrders] = useState<OrderLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error("Failed to fetch order history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="h-5 w-5 text-sky-500" />
            <span>Audit Log Stream & Order History</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Complete execution record of all B2B order runs in Neon DB.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh History</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold">Historical Order Runs ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Customer ID</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Total Amount</th>
                  <th className="p-3">Risk Score</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-sans">
                      <div className="flex items-center justify-center space-x-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-sky-500" />
                        <span className="text-xs font-medium">Loading historical audit logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 font-sans">
                      No historical runs found.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-3 font-bold text-sky-600 dark:text-sky-400">{o.id}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 font-sans">{o.customer_id}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        o.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                        o.status === 'HELD_FOR_REVIEW' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' :
                        'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="p-3 font-bold">${o.total_amount?.toFixed(2)}</td>
                    <td className="p-3 text-purple-600 dark:text-purple-400 font-bold">{o.risk_score || 0}/100</td>
                    <td className="p-3 text-slate-500 font-sans text-[11px]">{o.created_at?.split('T')[0] || '2026-08-22'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
