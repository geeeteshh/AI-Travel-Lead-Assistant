import React from 'react';
import { CheckCircle2, Circle, AlertCircle, Award, HelpCircle } from 'lucide-react';

export default function LeadDashboard({ extractedData, leadScore, confidence, reason, dbStatus, handleMockVerify }) {
  const [otpCode, setOtpCode] = React.useState('');
  const [otpError, setOtpError] = React.useState('');
  const [isVerifying, setIsVerifying] = React.useState(false);

  const handleOtpVerify = async () => {
    if (otpCode.trim().length !== 6) {
      setOtpError('Please enter a 6-digit verification code.');
      return;
    }
    setOtpError('');
    setIsVerifying(true);
    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: extractedData.phone,
          otp: otpCode.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        handleMockVerify();
      } else {
        setOtpError(data.error || 'Invalid code. Please try again.');
      }
    } catch (err) {
      setOtpError('Verification failed. Server connection error.');
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };
  
  const getScoreInfo = (score) => {
    if (score >= 70) return { color: 'bg-emerald-500 shadow-emerald-500/10', text: 'High Intent Lead', textClass: 'text-emerald-600' };
    if (score >= 31) return { color: 'bg-brand shadow-brand/10', text: 'Medium Intent Lead', textClass: 'text-brand' };
    return { color: 'bg-coral shadow-coral/10', text: 'Low Intent Lead', textClass: 'text-coral' };
  };

  const scoreInfo = getScoreInfo(leadScore);

  const getSyncStatusPill = (status) => {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Verified via Telegram
          </span>
        );
      case 'synced':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-light/40 text-brand border border-brand/20 shadow-sm animate-pulse">
            <AlertCircle className="h-3.5 w-3.5 mr-1" />
            Verification Pending
          </span>
        );
      case 'synced_mock':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-light/40 text-brand border border-brand/20 shadow-sm animate-pulse">
            <AlertCircle className="h-3.5 w-3.5 mr-1" />
            Verify (Mock DB)
          </span>
        );
      case 'sync_error':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-coral/10 text-coral border border-coral/20 shadow-sm">
            <AlertCircle className="h-3.5 w-3.5 mr-1" />
            Database Error
          </span>
        );
      case 'waiting_for_details':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 shadow-sm">
            <HelpCircle className="h-3.5 w-3.5 mr-1" />
            Awaiting Name & Phone
          </span>
        );
    }
  };

  const isFilled = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  };

  const checklistItems = [
    { label: 'Destination', value: extractedData.destination, type: 'text' },
    { label: 'Budget', value: extractedData.budget, type: 'text' },
    { label: 'Travel Month/Dates', value: extractedData.travelMonth, type: 'text' },
    { label: 'Travellers Count', value: extractedData.travellers, type: 'number' },
    { label: 'Client Name *', value: extractedData.name, type: 'text', critical: true },
    { label: 'Client Phone *', value: extractedData.phone, type: 'text', critical: true },
  ];

  return (
    <div className="flex flex-col h-full bg-cream-light/95 backdrop-blur-md rounded-2xl border border-slate-200/85 shadow-md overflow-hidden p-6 space-y-6">
      
      <div className="flex justify-between items-start border-b border-slate-200/80 pb-4">
        <div>
          <h2 className="font-semibold text-slate-800 text-lg">Live Lead Tracker</h2>
          <p className="text-xs text-slate-500">Real-time parameters checklist</p>
        </div>
        <div>{getSyncStatusPill(dbStatus)}</div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1.5">
            <Award className="h-4 w-4 text-brand" />
            <span className="text-sm font-medium text-slate-600">Intent Score</span>
          </div>
          <span className={`text-sm font-bold ${scoreInfo.textClass}`}>
            {leadScore}/100 ({scoreInfo.text})
          </span>
        </div>
        <div className="w-full bg-cream rounded-full h-3 overflow-hidden border border-slate-200/80 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreInfo.color}`}
            style={{ width: `${leadScore}%` }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parameters Checklist</p>
        
        <div className="space-y-2.5">
          {checklistItems.map((item, idx) => {
            const completed = isFilled(item.value);
            return (
              <div
                key={idx}
                className={`flex items-start justify-between p-3 rounded-xl border transition-all duration-200 ${
                  completed
                    ? item.critical
                      ? 'bg-emerald-55 border-emerald-200/60'
                      : 'bg-cream-dark/30 border-slate-200/40'
                    : item.critical
                    ? 'bg-coral/5 border-coral/20 opacity-90'
                    : 'bg-cream-dark/10 border-slate-100/50 opacity-60'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {completed ? (
                      <CheckCircle2 className={`h-4.5 w-4.5 ${item.critical ? 'text-emerald-500' : 'text-brand'}`} />
                    ) : (
                      <Circle className={`h-4.5 w-4.5 ${item.critical ? 'text-coral/50' : 'text-slate-300'}`} />
                    )}
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${completed ? 'text-slate-500' : 'text-slate-400'}`}>
                      {item.label}
                    </p>
                    <p className={`text-sm ${completed ? 'text-slate-800 font-semibold' : 'text-slate-400 italic font-normal'}`}>
                      {completed ? (item.type === 'number' ? `${item.value} travellers` : item.value) : 'Awaiting details...'}
                    </p>
                  </div>
                </div>
                {item.critical && !completed && (
                  <span className="text-[10px] bg-coral/10 border border-coral/20 text-coral px-1.5 py-0.5 rounded font-mono uppercase tracking-wider font-semibold">
                    Req
                  </span>
                )}
                {item.critical && completed && (
                  <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider font-semibold">
                    Acquired
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(dbStatus === 'synced' || dbStatus === 'synced_mock' || dbStatus === 'sync_error') && (
        <div className="p-4 rounded-xl bg-brand-light/30 border border-brand/20 space-y-3 animate-fade-in">
          <div className="flex justify-between items-center border-b border-brand/10 pb-1.5">
            <span className="text-xs font-semibold text-brand uppercase tracking-wider flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-brand animate-ping"></span>
              Telegram Verification
            </span>
            <button
              onClick={handleMockVerify}
              className="text-[10px] text-slate-400 hover:text-slate-600 underline font-medium"
            >
              [Simulate]
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed font-sans">
            To confirm this lead, open our Telegram Bot, click <strong>Start</strong>, and enter the OTP code sent to you below.
          </p>
          <a
            href={`https://t.me/aitravelleadassistbot?start=${encodeURIComponent(extractedData.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 text-white py-2 px-4 rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-500/10"
          >
            <span>Open Telegram Bot</span>
          </a>

          <div className="space-y-2 pt-2 border-t border-slate-200/50">
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit OTP code"
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-center focus:outline-none focus:ring-1 focus:ring-brand tracking-widest font-mono"
              />
              <button
                onClick={handleOtpVerify}
                disabled={isVerifying}
                className="bg-brand hover:bg-brand-hover disabled:bg-slate-350 text-white font-bold px-4 py-1.5 rounded-xl text-xs transition-all shadow-sm"
              >
                {isVerifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            {otpError && (
              <p className="text-[10px] text-coral font-semibold text-center">
                {otpError}
              </p>
            )}
          </div>
        </div>
      )}

      {dbStatus === 'verified' && (
        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2 animate-fade-in">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Verified via Telegram
          </span>
          <p className="text-xs text-slate-600 leading-relaxed font-sans">
            The phone number <strong>{extractedData.phone}</strong> was successfully verified. Lead status updated to active.
          </p>
        </div>
      )}

      <div className="p-4 rounded-xl bg-cream-dark/35 border border-slate-200/80 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reasoning Engine</span>
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-slate-400">Confidence:</span>
            <span
              className={`text-xs font-bold ${
                confidence === 'High'
                  ? 'text-emerald-600'
                  : confidence === 'Medium'
                  ? 'text-brand'
                  : 'text-coral'
              }`}
            >
              {confidence}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-sans italic">
          "{reason || 'Engage with the chat on the left to initialize AI Lead Intent extraction.'}"
        </p>
      </div>

    </div>
  );
}
