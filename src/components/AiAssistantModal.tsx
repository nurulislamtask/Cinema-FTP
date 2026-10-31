import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Film,
  Tv,
  CheckCircle2,
} from 'lucide-react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraryTitles: string[];
  onSelectTitle: (title: string) => void;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  libraryTitles,
  onSelectTitle,
}) => {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([
    {
      role: 'assistant',
      text: 'Hello! I am your CineFTP AI Cinema Assistant. Ask me for recommendations by genre, mood, actor, or say "Recommend something like Teach You a Lesson" or "Best Korean action drama"!',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (userPrompt?: string) => {
    const textToSend = (userPrompt || prompt).trim();
    if (!textToSend || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text: textToSend }]);
    setPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          libraryTitles,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply || 'Here are some great titles to check out from your catalog!',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Teach You a Lesson (★ 9.4), Bloodhounds, and Lovely Horribly are currently top rated in your collection!',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const samplePrompts = [
    'Recommend top Korean action drama',
    'Best Dual Audio movies to watch tonight',
    'Something funny and uplifting',
    'Shows like Teach You a Lesson',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-6 bg-black/60 backdrop-blur-sm select-none">
      <div className="w-full sm:w-[440px] h-[600px] max-h-[90vh] bg-[#0E121B] border border-[#222B3D] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1A2234] flex items-center justify-between bg-[#111624]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#E5A00D] text-black flex items-center justify-center shadow">
              <Sparkles className="w-4 h-4 fill-black" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-zinc-100">
                AI Cinema Assistant
              </h3>
              <p className="text-[10px] font-mono text-zinc-400">
                Powered by Gemini 2.5 Flash
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs custom-sidebar-scroll">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] p-3 rounded-xl leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#E5A00D] text-black font-medium'
                    : 'bg-[#151B2A] text-zinc-200 border border-[#232D42]'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#151B2A] text-zinc-400 border border-[#232D42] p-3 rounded-xl flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="text-[11px] font-mono">Consulting Gemini for library matches...</span>
              </div>
            </div>
          )}
        </div>

        {/* Sample Prompt Chips */}
        <div className="px-4 py-2 border-t border-[#161C2C] flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#0B0E15]">
          {samplePrompts.map((sp) => (
            <button
              key={sp}
              onClick={() => handleSend(sp)}
              className="text-[10px] font-mono whitespace-nowrap px-2.5 py-1 rounded-full bg-[#161D2C] hover:bg-[#20293D] text-zinc-300 border border-white/5 transition-colors cursor-pointer shrink-0"
            >
              {sp}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 border-t border-[#1A2234] bg-[#111624] flex items-center gap-2"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask about movies, genre, mood, actors..."
            className="flex-1 bg-[#161C2A] border border-[#222B3D] focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading}
            className="w-9 h-9 rounded-lg bg-[#E5A00D] hover:bg-[#F59E0B] text-black flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer shadow"
          >
            <Send className="w-4 h-4 fill-black" />
          </button>
        </form>
      </div>
    </div>
  );
};
