'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  MessageChannel,
  SenderType,
  AgentRequest,
  AgentResponse,
} from '@/lib/agent/types';
import ResponseCard from './ResponseCard';

// Message types for the chat interface
interface UserMessage {
  role: 'user';
  content: string;
  channel: MessageChannel;
  senderType: SenderType;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  timestamp: Date;
}

interface AssistantMessage {
  role: 'assistant';
  response: AgentResponse;
  timestamp: Date;
  responseTimeMs?: number;
}

type ChatMessage = UserMessage | AssistantMessage;

const CHANNELS: { value: MessageChannel; label: string; icon: React.ReactNode; color: string; bgColor: string; borderColor: string }[] = [
  { 
    value: 'whatsapp', 
    label: 'WhatsApp', 
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    color: 'text-white',
    bgColor: 'bg-[#25D366]',
    borderColor: 'border-[#25D366]'
  },
  { 
    value: 'email', 
    label: 'Email', 
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M22 6l-10 7L2 6"/>
      </svg>
    ),
    color: 'text-white',
    bgColor: 'bg-[#4285F4]',
    borderColor: 'border-[#4285F4]'
  },
  { 
    value: 'voice', 
    label: 'Voice', 
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
    color: 'text-white',
    bgColor: 'bg-[#8E44AD]',
    borderColor: 'border-[#8E44AD]'
  },
  { 
    value: 'sms', 
    label: 'SMS', 
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    color: 'text-white',
    bgColor: 'bg-[#FF6B35]',
    borderColor: 'border-[#FF6B35]'
  },
];

const SENDERS: { value: SenderType; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'xixi', label: 'Xixi' },
  { value: 'allen', label: 'Allen' },
];

// Pre-built demo scenarios
interface DemoScenario {
  name: string;
  icon: React.ReactNode;
  message: string;
  channel: MessageChannel;
  senderType: SenderType;
  senderName?: string;
  senderEmail?: string;
  color: string;
  bgColor: string;
  narration?: string;  // For guided demo mode
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    name: 'WISMO',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    ),
    message: "Where's my order CG-10001?",
    channel: 'whatsapp',
    senderType: 'customer',
    senderName: 'Sarah Miller',
    senderEmail: 'sarah.miller@email.com',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    narration: '📦 Most common query - "Where Is My Order?" BitBit looks up real-time tracking and provides proactive updates.',
  },
  {
    name: 'Return',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
      </svg>
    ),
    message: 'I want to return my exfoliating gloves, order CG-10002',
    channel: 'email',
    senderType: 'customer',
    senderName: 'John Chen',
    senderEmail: 'john.chen@email.com',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
    narration: '↩️ Return request - BitBit checks the 30-day return policy and order eligibility automatically.',
  },
  {
    name: 'Glove Sizing',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
      </svg>
    ),
    message: 'What size gloves should I get? My hand measures 7.5 inches around',
    channel: 'whatsapp',
    senderType: 'customer',
    senderName: 'Lisa Park',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
    narration: '📏 Product FAQ - BitBit references the sizing guide to provide personalized recommendations.',
  },
  {
    name: 'NZ Shipping',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    message: 'Do you ship to New Zealand? How long does it take and what are the customs fees?',
    channel: 'email',
    senderType: 'customer',
    senderName: 'Emma Wilson',
    senderEmail: 'emma.w@gmail.co.nz',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50 hover:bg-teal-100 border-teal-200',
    narration: '🌏 International shipping query - BitBit checks shipping policies for specific regions.',
  },
  {
    name: 'Cancel Sub',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3h18v18H3zM15 9l-6 6m0-6l6 6"/>
      </svg>
    ),
    message: 'I need to cancel my subscription. I signed up 2 months ago but want to stop.',
    channel: 'email',
    senderType: 'customer',
    senderName: 'Mike Brown',
    senderEmail: 'mike.brown@email.com',
    color: 'text-rose-700',
    bgColor: 'bg-rose-50 hover:bg-rose-100 border-rose-200',
    narration: '🔒 Policy edge case - Subscription cancellation with retention offer consideration.',
  },
  {
    name: 'Complaint',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    message: "The gloves didn't work at all and my skin is irritated! I want a full refund and I'm leaving a bad review.",
    channel: 'email',
    senderType: 'customer',
    senderName: 'Angry Customer',
    senderEmail: 'angry@email.com',
    color: 'text-red-700',
    bgColor: 'bg-red-50 hover:bg-red-100 border-red-200',
    narration: '⚠️ Escalation scenario - Complaint with health concern triggers human review protocol.',
  },
];

// Thinking step messages for the loading indicator
const THINKING_STEPS = [
  { text: 'Analyzing message intent...', icon: '🧠' },
  { text: 'Looking up customer history...', icon: '👤' },
  { text: 'Checking order details...', icon: '📦' },
  { text: 'Reviewing policies...', icon: '📋' },
  { text: 'Drafting response...', icon: '✍️' },
  { text: 'Calculating confidence...', icon: '📊' },
];

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

export default function ChatInterface() {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<MessageChannel>('whatsapp');
  const [selectedSender, setSelectedSender] = useState<SenderType>('customer');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Guided demo mode state
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const [showNarration, setShowNarration] = useState(false);
  
  // Thinking indicator state
  const [thinkingStep, setThinkingStep] = useState(0);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestStartTimeRef = useRef<number>(0);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Animate thinking steps while loading
  useEffect(() => {
    if (!isLoading) {
      setThinkingStep(0);
      return;
    }
    
    const interval = setInterval(() => {
      setThinkingStep((prev) => (prev + 1) % THINKING_STEPS.length);
    }, 800);
    
    return () => clearInterval(interval);
  }, [isLoading]);

  // Send message to agent
  const sendMessage = useCallback(async (overrideMessage?: string, overrideChannel?: MessageChannel, overrideSender?: SenderType, overrideName?: string, overrideEmail?: string) => {
    const messageToSend = overrideMessage || inputValue.trim();
    if (!messageToSend || isLoading) return;

    const userMessage: UserMessage = {
      role: 'user',
      content: messageToSend,
      channel: overrideChannel || selectedChannel,
      senderType: overrideSender || selectedSender,
      senderName: overrideName || senderName || undefined,
      senderEmail: overrideEmail || senderEmail || undefined,
      senderPhone: senderPhone || undefined,
      timestamp: new Date(),
    };

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setError(null);
    setIsLoading(true);
    requestStartTimeRef.current = Date.now();

    try {
      // Build request
      const request: AgentRequest = {
        message: userMessage.content,
        channel: userMessage.channel,
        sender: {
          type: userMessage.senderType,
          name: userMessage.senderName,
          email: userMessage.senderEmail,
          phone: userMessage.senderPhone,
        },
      };

      // Call agent API
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to get response');
      }

      const response: AgentResponse = await res.json();
      const responseTimeMs = Date.now() - requestStartTimeRef.current;

      // Add assistant message to chat
      const assistantMessage: AssistantMessage = {
        role: 'assistant',
        response,
        timestamp: new Date(),
        responseTimeMs,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      // In guided mode, auto-advance after response
      if (guidedMode && guidedStep < DEMO_SCENARIOS.length - 1) {
        setTimeout(() => {
          setShowNarration(true);
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, selectedChannel, selectedSender, senderName, senderEmail, senderPhone, isLoading, guidedMode, guidedStep]);

  // Handle Enter key (Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Apply a demo scenario
  const applyScenario = (scenario: DemoScenario) => {
    setSelectedChannel(scenario.channel);
    setSelectedSender(scenario.senderType);
    setSenderName(scenario.senderName || '');
    setSenderEmail(scenario.senderEmail || '');
    setSenderPhone('');
    setInputValue(scenario.message);
    // Focus the textarea after a brief delay to ensure state updates
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  // Run scenario immediately (for guided mode)
  const runScenario = (scenario: DemoScenario) => {
    sendMessage(
      scenario.message,
      scenario.channel,
      scenario.senderType,
      scenario.senderName,
      scenario.senderEmail
    );
  };

  // Start guided demo
  const startGuidedDemo = () => {
    setGuidedMode(true);
    setGuidedStep(0);
    setMessages([]);
    setShowNarration(true);
  };

  // Next step in guided demo
  const nextGuidedStep = () => {
    setShowNarration(false);
    const scenario = DEMO_SCENARIOS[guidedStep];
    runScenario(scenario);
    setGuidedStep((prev) => prev + 1);
  };

  // Exit guided demo
  const exitGuidedDemo = () => {
    setGuidedMode(false);
    setGuidedStep(0);
    setShowNarration(false);
  };

  // Get channel config
  const getChannelConfig = (channel: MessageChannel) => {
    return CHANNELS.find(c => c.value === channel) || CHANNELS[0];
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-4 p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        {/* Channel selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-600">Channel:</span>
          <div className="flex gap-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.value}
                onClick={() => setSelectedChannel(channel.value)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 transform hover:scale-105 ${
                  selectedChannel === channel.value
                    ? `${channel.bgColor} ${channel.color} shadow-lg`
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
              >
                {channel.icon}
                <span className="hidden sm:inline">{channel.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sender selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-600">From:</span>
          <select
            value={selectedSender}
            onChange={(e) => setSelectedSender(e.target.value as SenderType)}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-white border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm hover:shadow-md transition-shadow"
          >
            {SENDERS.map((sender) => (
              <option key={sender.value} value={sender.value}>
                {sender.label}
              </option>
            ))}
          </select>
        </div>

        {/* Customer details (only show when sender is customer) */}
        {selectedSender === 'customer' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl bg-white border border-gray-200 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-28 shadow-sm"
            />
            <input
              type="email"
              placeholder="Email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl bg-white border border-gray-200 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent w-36 shadow-sm"
            />
          </div>
        )}
        
        {/* Guided Demo Toggle */}
        <div className="ml-auto">
          <button
            onClick={guidedMode ? exitGuidedDemo : startGuidedDemo}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 ${
              guidedMode
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg'
                : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 hover:from-purple-100 hover:to-purple-200 hover:text-purple-700'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            {guidedMode ? 'Exit Demo' : 'Guided Demo'}
          </button>
        </div>
      </div>

      {/* Guided mode narration overlay */}
      {guidedMode && showNarration && guidedStep < DEMO_SCENARIOS.length && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${DEMO_SCENARIOS[guidedStep].bgColor.split(' ')[0]} ${DEMO_SCENARIOS[guidedStep].color}`}>
                {DEMO_SCENARIOS[guidedStep].icon}
              </div>
              <div>
                <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                  Scenario {guidedStep + 1} of {DEMO_SCENARIOS.length}
                </span>
                <h3 className="text-lg font-bold text-gray-900">
                  {DEMO_SCENARIOS[guidedStep].name}
                </h3>
              </div>
            </div>
            
            <p className="text-gray-700 mb-4 leading-relaxed">
              {DEMO_SCENARIOS[guidedStep].narration}
            </p>
            
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Message:</span>
              <p className="text-sm text-gray-800 mt-1 italic">
                "{DEMO_SCENARIOS[guidedStep].message}"
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={nextGuidedStep}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Run This Scenario →
              </button>
              <button
                onClick={exitGuidedDemo}
                className="px-4 py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition-all"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-gray-50/50 to-white relative">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 mb-5 shadow-xl">
                <span className="text-3xl font-bold text-white">B</span>
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Welcome to BitBit</h3>
            <p className="text-sm text-gray-500 max-w-md mb-6">
              Your AI-powered customer support assistant. Try one of the scenarios below or type your own message.
            </p>
            
            {/* Guided demo CTA for empty state */}
            <button
              onClick={startGuidedDemo}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 mb-4"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Start Guided Demo
            </button>
            <p className="text-xs text-gray-400">or choose a scenario below</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {message.role === 'user' ? (
                <div className="max-w-[80%]">
                  <div className="bg-gradient-to-br from-purple-600 to-purple-700 text-white rounded-2xl rounded-br-md px-5 py-3 shadow-lg">
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2 text-xs text-gray-400">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${getChannelConfig(message.channel).bgColor} ${getChannelConfig(message.channel).color}`}>
                      {getChannelConfig(message.channel).icon}
                    </span>
                    <span className="capitalize font-medium">{message.senderType}</span>
                    {message.senderName && <span className="text-gray-500">• {message.senderName}</span>}
                    <span className="text-gray-400">• {formatTime(message.timestamp)}</span>
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%]">
                  <ResponseCard 
                    response={message.response} 
                    timestamp={message.timestamp}
                    responseTimeMs={message.responseTimeMs}
                  />
                </div>
              )}
            </div>
          ))
        )}

        {/* Enhanced Loading indicator with thinking steps */}
        {isLoading && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-white rounded-2xl rounded-bl-md px-5 py-4 shadow-lg border border-gray-100 min-w-[280px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 animate-pulse">
                  <span className="text-sm font-bold text-white">B</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-700">BitBit is working...</span>
                </div>
              </div>
              
              {/* Thinking steps */}
              <div className="space-y-2 ml-11">
                {THINKING_STEPS.map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                      idx === thinkingStep 
                        ? 'text-purple-700 font-medium scale-105 origin-left' 
                        : idx < thinkingStep 
                          ? 'text-green-600' 
                          : 'text-gray-300'
                    }`}
                  >
                    <span className="text-base">{idx < thinkingStep ? '✓' : step.icon}</span>
                    <span>{step.text}</span>
                    {idx === thinkingStep && (
                      <span className="flex gap-1 ml-1">
                        <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex justify-center animate-shake">
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scenario buttons + Input area */}
      <div className="border-t border-gray-100 p-5 bg-white">
        {/* Quick scenario buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-2 self-center">Quick demos:</span>
          {DEMO_SCENARIOS.map((scenario) => (
            <button
              key={scenario.name}
              onClick={() => applyScenario(scenario)}
              disabled={isLoading}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 transform hover:scale-105 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${scenario.bgColor} ${scenario.color}`}
              title={`${scenario.message} (${scenario.channel}, ${scenario.senderType})`}
            >
              {scenario.icon}
              {scenario.name}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message to BitBit..."
              disabled={isLoading}
              rows={1}
              className="w-full resize-none pl-5 pr-5 py-4 text-sm rounded-2xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="px-6 py-4 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl hover:from-purple-700 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono text-xs">Enter</kbd> to send • <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 font-mono text-xs">Shift+Enter</kbd> for new line
        </p>
      </div>

      {/* Custom styles for animations */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
        .animate-shake {
          animation: shake 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
