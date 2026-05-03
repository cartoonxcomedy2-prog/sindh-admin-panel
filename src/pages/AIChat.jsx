import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AIChat = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: "Hello! I'm your EduKar Admin AI Assistant. How can I help you manage the platform today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulated AI Response logic
    // In a real scenario, this would be an API call to Gemini or similar
    setTimeout(() => {
      const botResponse = {
        id: Date.now() + 1,
        role: 'assistant',
        content: getSimulatedResponse(input),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const getSimulatedResponse = (query) => {
    const q = query.toLowerCase();
    if (q.includes('hello') || q.includes('hi')) return "Hi there! I'm ready to assist you with the EduKar Admin Panel. You can ask me about universities, scholarships, or platform stats.";
    if (q.includes('university') || q.includes('uni')) return "You can manage universities from the 'All Universities' section. Currently, we have several top institutions listed in Sindh.";
    if (q.includes('scholarship')) return "Scholarships are active! You can review applicant counts and deadlines in the 'All Scholarships' section.";
    if (q.includes('user')) return "We have a growing number of registered users. You can view their profiles and activity in the 'Platform Users' section.";
    return "That's an interesting question. As your AI assistant, I'm here to help you navigate this dashboard and manage student applications efficiently. Is there anything specific you'd like to know about the current listings?";
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setMessages([
        {
          id: Date.now(),
          role: 'assistant',
          content: "Chat cleared. How else can I help you today?",
          timestamp: new Date(),
        },
      ]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-teal-600 to-blue-600 text-white flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/30 shadow-inner">
            <Sparkles size={20} className="text-teal-100" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">EduKar AI Assistant</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-teal-100 uppercase tracking-wider">AI Engine Active</span>
            </div>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="p-2.5 hover:bg-white/10 rounded-xl transition-all duration-200 group active:scale-95"
          title="Clear Chat"
        >
          <Trash2 size={18} className="text-teal-100 group-hover:text-white" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-md
                  ${msg.role === 'user' 
                    ? 'bg-blue-600 text-white order-2' 
                    : 'bg-white text-teal-600 border border-slate-200 order-1'}`}
                >
                  {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                </div>
                
                <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl shadow-sm leading-relaxed text-sm
                    ${msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none font-medium' 
                      : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none font-medium'}`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1.5 font-bold uppercase tracking-tighter">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex gap-3 items-center">
              <div className="w-9 h-9 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-teal-600 shadow-sm">
                <Bot size={18} />
              </div>
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-none flex gap-1 items-center shadow-sm">
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100">
        <form
          onSubmit={handleSend}
          className="relative flex items-center gap-2 max-w-4xl mx-auto"
        >
          <div className="absolute left-4 text-slate-400 pointer-events-none">
            <MessageSquare size={18} />
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything about the EduKar Admin Panel..."
            className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-11 pr-14 text-sm focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className={`absolute right-2 p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center
              ${!input.trim() || isTyping 
                ? 'text-slate-300 bg-slate-50 cursor-not-allowed' 
                : 'text-white bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/30 active:scale-95'}`}
          >
            {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        <p className="text-[10px] text-center text-slate-400 mt-3 font-medium uppercase tracking-widest">
          Powered by EduKar Admin Intelligence • Experimental Preview
        </p>
      </div>
    </div>
  );
};

export default AIChat;
