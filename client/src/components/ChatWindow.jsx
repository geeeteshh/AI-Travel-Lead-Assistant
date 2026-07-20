import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Compass, Loader2 } from 'lucide-react';

export default function ChatWindow({ messages, sendMessage, isLoading }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleSuggestionClick = (suggestion) => {
    if (isLoading) return;
    sendMessage(suggestion);
  };

  const suggestions = [
    "I want to go to Tokyo with my spouse for 10 days in October. Budget is around $6,000.",
    "Hey! I'm planning a solo trip to Italy next summer, maybe July. Looking for budget advice.",
    "Planning a trip for 4 friends to Paris in December. My name is Alex, call me at 555-0144."
  ];

  return (
    <div className="flex flex-col h-full bg-cream-light/95 backdrop-blur-md rounded-2xl border border-slate-200/85 shadow-md overflow-hidden">
      <div className="px-6 py-4 bg-cream/60 border-b border-slate-200/80 flex items-center space-x-3">
        <div className="p-2 bg-brand/10 text-brand rounded-lg">
          <Compass className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">Interactive Planner</h2>
          <p className="text-xs text-slate-500">Describe your vacation and let us capture details</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length <= 1 && (
          <div className="my-6 p-4 rounded-xl bg-cream-dark/40 border border-slate-200/60 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Start Suggestions</p>
            <div className="grid grid-cols-1 gap-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading}
                  className="text-left text-sm px-4 py-2.5 rounded-lg bg-white hover:bg-brand-light/30 border border-slate-200/80 hover:border-brand/30 transition text-slate-600 hover:text-brand duration-200 shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, index) => {
          const isAI = msg.sender === 'ai';
          return (
            <div
              key={index}
              className={`flex items-start space-x-3 ${!isAI ? 'flex-row-reverse space-x-reverse' : ''}`}
            >
              <div
                className={`flex-shrink-0 p-2 rounded-lg ${isAI
                    ? 'bg-brand/10 text-brand border border-brand/10'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
              >
                {isAI ? <Compass className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm transition duration-200 leading-relaxed ${isAI
                    ? 'bg-cream-dark border border-slate-200/60 text-slate-800 rounded-tl-none'
                    : 'bg-brand border border-brand text-white rounded-tr-none'
                  }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>
                <span className="block text-[10px] mt-1.5 opacity-60 text-right">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 p-2 rounded-lg bg-brand/10 text-brand border border-brand/10">
              <Compass className="h-4 w-4 animate-spin" />
            </div>
            <div className="bg-cream-dark/50 border border-slate-200/40 rounded-2xl rounded-tl-none px-4 py-3 text-sm shadow-sm flex items-center space-x-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              <span>We are processing your request...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-cream/60 border-t border-slate-200/80 flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isLoading ? "Please wait..." : "Type your travel plans here..."}
          disabled={isLoading}
          className="flex-1 bg-white border border-slate-300 hover:border-slate-400 focus:border-brand rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/20 transition duration-200 shadow-sm"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-3 bg-brand hover:bg-brand-hover disabled:bg-slate-100 text-white disabled:text-slate-300 rounded-xl transition duration-200 shadow-md shadow-brand/10 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
