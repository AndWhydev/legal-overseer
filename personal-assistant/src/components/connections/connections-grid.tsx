'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Calendar,
  CheckSquare,
  MessageCircle,
  CreditCard,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';

interface Connection {
  id: string;
  name: string;
  description: string;
  category: 'communication' | 'productivity' | 'finance';
  icon: string;
  color: string;
  auth: 'oauth' | 'api_key';
  comingSoon?: boolean;
}

const CONNECTIONS: Connection[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Sync emails and drafts',
    category: 'communication',
    icon: 'Mail',
    color: '#EA4335',
    auth: 'oauth',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Microsoft email and calendar',
    category: 'communication',
    icon: 'Mail',
    color: '#0078D4',
    auth: 'oauth',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Events and scheduling',
    category: 'productivity',
    icon: 'Calendar',
    color: '#4285F4',
    auth: 'oauth',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Tasks and project tracking',
    category: 'productivity',
    icon: 'CheckSquare',
    color: '#F06A6A',
    auth: 'oauth',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Meeting scheduling',
    category: 'productivity',
    icon: 'CalendarClock',
    color: '#006BFF',
    auth: 'oauth',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing',
    category: 'finance',
    icon: 'CreditCard',
    color: '#635BFF',
    auth: 'api_key',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Messaging',
    category: 'communication',
    icon: 'MessageCircle',
    color: '#25D366',
    auth: 'api_key',
  },
  {
    id: 'facebook-messenger',
    name: 'Facebook Messenger',
    description: 'Messaging via Meta',
    category: 'communication',
    icon: 'MessageCircle',
    color: '#0084FF',
    auth: 'oauth',
    comingSoon: true,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'DMs and story mentions',
    category: 'communication',
    icon: 'MessageCircle',
    color: '#E4405F',
    auth: 'oauth',
    comingSoon: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team messaging and channels',
    category: 'communication',
    icon: 'MessageCircle',
    color: '#4A154B',
    auth: 'oauth',
    comingSoon: true,
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Accounting and invoicing',
    category: 'finance',
    icon: 'CreditCard',
    color: '#13B5EA',
    auth: 'oauth',
    comingSoon: true,
  },
];

const ICON_MAP: Record<string, LucideIcon> = {
  Mail,
  Calendar,
  CheckSquare,
  MessageCircle,
  CreditCard,
  CalendarClock,
};

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'communication', label: 'Communication' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'finance', label: 'Finance' },
] as const;

interface ConnectionStatus {
  connected: boolean;
  connectedAt?: string;
}

interface ConnectionCardProps {
  connection: Connection;
  status: ConnectionStatus;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  isLoading: boolean;
}

function ConnectionCard({
  connection,
  status,
  onConnect,
  onDisconnect,
  isLoading,
}: ConnectionCardProps) {
  const Icon = ICON_MAP[connection.icon];

  return (
    <div className={`bg-[#1A1A1A] border border-[#333] rounded-xl p-5 transition-all ${connection.comingSoon ? 'opacity-60' : 'hover:border-[#D4A574]/30'}`}>
      {/* Icon + Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${connection.color}20` }}
        >
          {Icon && <Icon size={20} style={{ color: connection.color }} />}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-[#F0F0F0]">{connection.name}</h3>
          <p className="text-xs text-[#94A3B8]">{connection.description}</p>
        </div>
      </div>

      {/* Status + Button Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {connection.comingSoon ? (
            <span className="text-xs font-medium text-[#D4A574]/70">Coming Soon</span>
          ) : status.connected ? (
            <>
              <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <span className="text-xs font-medium text-[#22C55E]">Connected</span>
            </>
          ) : (
            <span className="text-xs text-[#94A3B8]">Disconnected</span>
          )}
        </div>

        {connection.comingSoon ? (
          <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#333]/50 text-[#94A3B8]/50 cursor-default">
            Connect
          </span>
        ) : status.connected ? (
          <button
            onClick={() => onDisconnect(connection.id)}
            disabled={isLoading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-[#94A3B8] hover:text-[#F0F0F0] hover:bg-[#333] transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => onConnect(connection.id)}
            disabled={isLoading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#D4A574] text-black hover:bg-[#D4A574]/90 transition-colors disabled:opacity-50"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

export function ConnectionsGrid() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Fetch initial status from API
  useEffect(() => {
    const fetchStatuses = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/channels/status');
        if (!response.ok) throw new Error('Failed to fetch status');

        const data = (await response.json()) as Record<string, ConnectionStatus>;
        setStatuses(data);
      } catch (err) {
        console.error('Error fetching connection statuses:', err);
        // Initialize all as disconnected on error
        const initial: Record<string, ConnectionStatus> = {};
        CONNECTIONS.forEach((conn) => {
          initial[conn.id] = { connected: false };
        });
        setStatuses(initial);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatuses();
  }, []);

  const handleConnect = useCallback(async (id: string) => {
    const connection = CONNECTIONS.find((c) => c.id === id);
    if (!connection) return;

    try {
      setLoadingId(id);

      if (connection.auth === 'oauth') {
        // For OAuth: call API to get redirect URL, then open it
        const response = await fetch('/api/channels/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: id }),
        });

        if (!response.ok) throw new Error('Failed to initiate OAuth');

        const data = (await response.json()) as { redirectUrl: string };
        window.location.href = data.redirectUrl;
      } else {
        // For API key: show inline input (would require dialog state in real impl)
        console.log(`Open API key dialog for ${id}`);
      }
    } catch (err) {
      console.error(`Error connecting ${id}:`, err);
      setLoadingId(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (id: string) => {
    try {
      setLoadingId(id);

      const response = await fetch('/api/channels/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: id }),
      });

      if (!response.ok) throw new Error('Failed to disconnect');

      // Update status
      setStatuses((prev) => ({
        ...prev,
        [id]: { connected: false },
      }));
    } catch (err) {
      console.error(`Error disconnecting ${id}:`, err);
    } finally {
      setLoadingId(null);
    }
  }, []);

  // Filter connections by category
  const filtered =
    activeCategory === 'all'
      ? CONNECTIONS
      : CONNECTIONS.filter((c) => c.category === activeCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[#F0F0F0]">Connections</h2>
        <p className="text-sm text-[#94A3B8]">
          Connect your tools to let BitBit work across your stack.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-[#D4A574]/20 text-[#D4A574]'
                : 'text-[#94A3B8] hover:text-[#F0F0F0]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            status={statuses[connection.id] || { connected: false }}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            isLoading={loadingId === connection.id}
          />
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-[#94A3B8]">
          No connections in this category
        </div>
      )}
    </div>
  );
}
