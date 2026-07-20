import React, { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import LeadDashboard from './components/LeadDashboard';
import { Compass } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: "Hello! I'm your AI Travel Planner. \n\nI can help you design a customized itinerary for your next vacation. To get started, where are you planning to travel next?",
      timestamp: new Date()
    }
  ]);

  const [extractedData, setExtractedData] = useState({
    destination: '',
    budget: '',
    travelMonth: '',
    travellers: null,
    name: '',
    phone: ''
  });

  const [leadScore, setLeadScore] = useState(0);
  const [confidence, setConfidence] = useState('Low');
  const [reason, setReason] = useState('No details gathered yet.');
  const [dbStatus, setDbStatus] = useState('waiting_for_details');
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    let intervalId = null;

    if ((dbStatus === 'synced' || dbStatus === 'sync_error') && extractedData.phone) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/lead-status?phone=${encodeURIComponent(extractedData.phone)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.phone_verified) {
              setDbStatus('verified');
              clearInterval(intervalId);
            }
          }
        } catch (err) {
          console.error("Error polling verification status:", err);
        }
      }, 3000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [dbStatus, extractedData.phone]);

  const handleMockVerify = async () => {
    if (!extractedData.phone) return;
    try {
      const res = await fetch('/api/mock-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: extractedData.phone })
      });
      if (res.ok) {
        setDbStatus('verified');
      }
    } catch (err) {
      console.error("Failed mock verification:", err);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    const userMessage = {
      sender: 'user',
      text: text,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const historyToSend = messages.map((m) => ({
        sender: m.sender,
        text: m.text
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: historyToSend
        })
      });

      if (!response.ok) {
        let errorMessage = `Server error (Status: ${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
            if (errorData.details) {
              errorMessage += `: ${errorData.details}`;
            }
          }
        } catch (_) { }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: data.reply,
          timestamp: new Date()
        }
      ]);

      if (data.extractedData) {
        setExtractedData(data.extractedData);
      }
      if (typeof data.leadScore === 'number') {
        setLeadScore(data.leadScore);
      }
      if (data.confidence) {
        setConfidence(data.confidence);
      }
      if (data.reason) {
        setReason(data.reason);
      }
      if (data.dbStatus) {
        setDbStatus(data.dbStatus);
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `We are facing some technical issues. Please try again later`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-cream-light/80 border-b border-slate-200/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand rounded-xl shadow-lg shadow-brand/10 text-white flex items-center justify-center">
              <Compass className="h-6 w-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="font-extrabold text-lg text-slate-800 font-sans tracking-tight">
                AI Travel Lead Assistant
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-10 gap-6 h-[calc(100vh-80px)] overflow-hidden">
        <div className="lg:col-span-7 h-full flex flex-col">
          <ChatWindow
            messages={messages}
            sendMessage={sendMessage}
            isLoading={isLoading}
          />
        </div>

        <div className="lg:col-span-3 h-full flex flex-col">
          <LeadDashboard
            extractedData={extractedData}
            leadScore={leadScore}
            confidence={confidence}
            reason={reason}
            dbStatus={dbStatus}
            handleMockVerify={handleMockVerify}
          />
        </div>
      </main>
    </div>
  );
}
