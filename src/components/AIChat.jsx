import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User, X } from 'lucide-react';
import API from '../api';

const asArray = (value) => (Array.isArray(value) ? value : []);

export default function AIChat({ admin }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text:
        'EduKar Admin AI ready. Ask about applicants, missing documents, apply failures, merit trends, programs, fees, or contacts.',
      suggestions: [],
      diagnostics: [],
      meritInsights: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        text: userMessage,
        suggestions: [],
        diagnostics: [],
        meritInsights: [],
      },
    ]);
    setIsLoading(true);

    try {
      const response = await API.post('/chat', {
        message: userMessage,
      });

      const payload = response?.data || {};
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: payload.reply || 'No response from AI',
          suggestions: asArray(payload.suggestions),
          diagnostics: asArray(payload.diagnostics),
          meritInsights: asArray(payload.meritInsights),
        },
      ]);
    } catch (error) {
      const serverMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'AI service error. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: serverMessage,
          suggestions: [],
          diagnostics: [],
          meritInsights: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 px-5 py-3.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold rounded-full shadow-[0_8px_30px_rgba(20,184,166,0.4)] hover:shadow-[0_8px_40px_rgba(20,184,166,0.6)] hover:scale-105 transition-all duration-300 z-50 flex items-center gap-2 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <Sparkles size={20} className="animate-pulse" />
        <span>Ask AI</span>
      </button>

      <div
        className={`fixed bottom-6 right-6 w-96 h-[560px] max-h-[82vh] bg-white rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.15)] flex flex-col z-50 transition-all duration-300 transform origin-bottom-right overflow-hidden border border-slate-200 ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
      >
        <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="font-bold leading-none mb-1">Admin AI Assistant</h3>
              <p className="text-[10px] text-teal-100 uppercase tracking-wider font-semibold">
                {admin?.role || 'admin'} Scope
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div key={idx} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-slate-200' : 'bg-teal-100 text-teal-600'}`}
                >
                  {isUser ? (
                    <User size={16} className="text-slate-500" />
                  ) : (
                    <Bot size={16} />
                  )}
                </div>

                <div className={`max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser ? 'bg-slate-800 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {msg.text}
                  </div>

                  {!isUser && asArray(msg.suggestions).length > 0 && (
                    <div className="w-full space-y-2">
                      {asArray(msg.suggestions)
                        .slice(0, 5)
                        .map((item, i) => (
                          <div
                            key={`sg-${i}`}
                            className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                          >
                            <div className="font-bold text-slate-800">{item.title || 'Suggestion'}</div>
                            <div className="text-slate-500 mt-1">{item.subtitle || ''}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                              <span className="rounded bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">
                                Match {item.matchScore ?? 0}%
                              </span>
                              {item.status ? (
                                <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 font-semibold">
                                  {item.status}
                                </span>
                              ) : null}
                              {item.applicationFee ? (
                                <span className="rounded bg-blue-50 text-blue-700 px-2 py-0.5 font-semibold">
                                  Fee {item.applicationFee}
                                </span>
                              ) : null}
                            </div>
                            {Array.isArray(item.programHighlights) && item.programHighlights.length > 0 ? (
                              <div className="mt-2 text-slate-600">
                                Programs: {item.programHighlights.slice(0, 3).join(', ')}
                              </div>
                            ) : null}
                            {item.contactSummary ? (
                              <div className="mt-1 text-slate-600">Contact: {item.contactSummary}</div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  )}

                  {!isUser && asArray(msg.diagnostics).length > 0 && (
                    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
                      <div className="font-bold text-amber-800">Diagnostics</div>
                      {asArray(msg.diagnostics)
                        .slice(0, 4)
                        .map((item, i) => (
                          <div key={`dg-${i}`} className="text-amber-900">
                            <div className="font-semibold">
                              {item.targetName || 'Application'} ({item.status || 'Applied'})
                            </div>
                            <div className="text-amber-800">
                              Student: {item.studentName || 'N/A'}
                              {item.appliedAt ? ` | Applied: ${new Date(item.appliedAt).toLocaleDateString()}` : ''}
                            </div>
                            {Array.isArray(item.decisionReasons) && item.decisionReasons.length > 0 ? (
                              <div className="text-amber-800">Reason: {item.decisionReasons[0]}</div>
                            ) : null}
                            {item.documentValidation?.missing?.length ? (
                              <div className="text-amber-800">
                                Missing: {item.documentValidation.missing.slice(0, 3).join(', ')}
                              </div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  )}

                  {!isUser && asArray(msg.meritInsights).length > 0 && (
                    <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs space-y-2">
                      <div className="font-bold text-blue-800">Recent Closing Merit</div>
                      {asArray(msg.meritInsights)
                        .slice(0, 4)
                        .map((item, i) => (
                          <div key={`mt-${i}`} className="text-blue-900">
                            {item.institutionName || 'Institution'} - {item.programName || 'General'}
                            {item.closingMeritPercentage != null
                              ? ` | Closing ${item.closingMeritPercentage}%`
                              : ''}
                            {item.totalSelected != null ? ` | Selected ${item.totalSelected}` : ''}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                <Bot size={16} />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-white border border-slate-200 shadow-sm flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-teal-500" />
                <span className="text-xs font-semibold text-slate-500">AI is thinking...</span>
              </div>
            </div>
          )}

          <div ref={endOfMessagesRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-full border border-slate-200 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-400/20 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about docs, merit, programs, fees..."
              className="flex-1 bg-transparent px-3 text-sm focus:outline-none text-slate-700 placeholder:text-slate-400"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 bg-teal-500 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-slate-300 transition-colors hover:bg-teal-600"
            >
              <Send size={16} className={input.trim() && !isLoading ? 'ml-0.5' : ''} />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
