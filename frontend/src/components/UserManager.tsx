"use client";

import React, { useState, useEffect } from 'react';
import { Users, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface CustomerUser {
  id: string;
  name: string;
  email: string;
  company_name?: string;
  credit_limit: number;
  current_exposure: number;
}

export const UserManager: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  // Form state
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [creditLimit, setCreditLimit] = useState('50000');

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/customers`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (e) {
      console.error("Failed to load customers", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName || !custEmail) return;
    setAdding(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/customers/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: custName.trim(),
          email: custEmail.trim(),
          credit_limit: parseFloat(creditLimit) || 50000.0
        })
      });
      if (res.ok) {
        setCustName('');
        setCustEmail('');
        fetchCustomers();
      }
    } catch (e) {
      console.error("Add customer failed", e);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-500" />
            <span>User & Customer Management</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">View customer accounts, credit limits, and credit exposure in Neon DB.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCustomers} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Add Customer Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold flex items-center space-x-1.5">
            <Plus className="h-4 w-4 text-sky-500" />
            <span>Add New Customer Account</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={handleAddCustomer} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Customer Name</label>
              <Input
                placeholder="Apex Technologies"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Email Address</label>
              <Input
                type="email"
                placeholder="purchasing@apex.com"
                value={custEmail}
                onChange={(e) => setCustEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Credit Limit ($)</label>
              <Input
                type="number"
                placeholder="50000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={adding} className="w-full font-bold">
                {adding ? "Adding..." : "Add Customer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Customers List Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-xs font-bold">Registered Customer Accounts ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Customer ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Credit Limit</th>
                  <th className="p-3">Current Exposure</th>
                  <th className="p-3">Credit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {customers.map((c) => {
                  const pct = ((c.current_exposure || 0) / (c.credit_limit || 1)) * 100;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-3 font-bold text-sky-600 dark:text-sky-400">{c.id}</td>
                      <td className="p-3 text-slate-800 dark:text-slate-200 font-sans font-semibold">{c.name}</td>
                      <td className="p-3 text-slate-500 font-sans">{c.email}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">${c.credit_limit?.toLocaleString()}</td>
                      <td className="p-3 font-bold text-amber-600 dark:text-amber-400">${c.current_exposure?.toLocaleString()}</td>
                      <td className="p-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pct < 75 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}>
                          {pct.toFixed(0)}% Exposure
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
