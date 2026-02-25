import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Agent packages exist as workspace packages but aren't available on Vercel.
    // Alias them to false so webpack treats them as empty modules.
    const agentPackages = [
      '@bitbit/agent-lead-swarm',
      '@bitbit/agent-invoice-flow',
      '@bitbit/agent-channel-triage',
      '@bitbit/agent-client-comms',
      '@bitbit/agent-proposal-bot',
      '@bitbit/agent-ad-script-gen',
      '@bitbit/agent-client-onboarding',
      '@bitbit/agent-ai-search-optimizer',
      '@bitbit/agent-tender-hunter',
      '@bitbit/agent-sentry',
    ];
    
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    
    for (const pkg of agentPackages) {
      (config.resolve.alias as Record<string, string | false>)[pkg] = false;
    }
    
    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
