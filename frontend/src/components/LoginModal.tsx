"use client";

import React, { useState } from 'react';
import { Lock, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface LoginModalProps {
  onLoginSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.trim() === 'supervity2026' || passcode.trim() === 'admin') {
      localStorage.setItem('o2c_auth', 'authenticated');
      onLoginSuccess();
    } else {
      setError('Invalid Access Key. (Default: supervity2026)');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <Card className="w-full max-w-sm shadow-2xl border-slate-300 dark:border-slate-800">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-sky-500/20 text-sky-500 flex items-center justify-center border border-sky-500/30">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-bold">Supervity O2C Command Center</CardTitle>
          <CardDescription>Enter Access Passcode to unlock multi-agent control panel and protect Gemini API quota.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Access Passcode</label>
              <Input
                type="password"
                placeholder="Enter passcode (supervity2026)"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setError('');
                }}
                className="text-center font-mono"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-xs text-rose-500 font-semibold text-center">{error}</p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full font-bold">
              <span>Unlock Command Center</span>
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
