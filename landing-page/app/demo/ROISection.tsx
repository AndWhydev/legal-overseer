'use client';

import { useState, useEffect } from 'react';

/**
 * Animated counter hook
 */
function useAnimatedCounter(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number | null = null;
    const startValue = 0;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      
      setCount(Math.floor(startValue + (target - startValue) * easeOutQuart));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration]);
  
  return count;
}

/**
 * ROI Calculator / Impact Section
 * Shows the business value BitBit delivers
 */
export default function ROISection() {
  const [isVisible, setIsVisible] = useState(false);
  
  // Demo metrics (would be real data in production)
  const metrics = {
    conversationsHandled: 847,
    hoursSaved: 28.4,
    avgResponseTime: 12, // seconds
    customerSatisfaction: 94,
    escalationRate: 8, // percent
    costSavings: 2840, // dollars
  };
  
  // Animated values (only animate when visible)
  const animatedConversations = useAnimatedCounter(isVisible ? metrics.conversationsHandled : 0, 2500);
  const animatedHours = useAnimatedCounter(isVisible ? Math.floor(metrics.hoursSaved * 10) : 0, 2000);
  const animatedSavings = useAnimatedCounter(isVisible ? metrics.costSavings : 0, 2500);
  
  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setIsVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative py-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-green-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-6">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Real Results
          </span>
          
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            The Numbers That Matter
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            This week&apos;s impact for a brand like CheekyGlo with ~500 daily customer interactions
          </p>
        </div>

        {/* Main stats grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {/* Conversations Handled */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-green-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-green-400 uppercase tracking-wider">Conversations</span>
              </div>
              <div className="text-5xl font-bold text-white mb-2">
                {animatedConversations.toLocaleString()}
              </div>
              <p className="text-gray-400">
                Handled automatically this week
              </p>
            </div>
          </div>

          {/* Hours Saved */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-blue-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-blue-400 uppercase tracking-wider">Time Saved</span>
              </div>
              <div className="text-5xl font-bold text-white mb-2">
                {(animatedHours / 10).toFixed(1)}h
              </div>
              <p className="text-gray-400">
                Of support time this week
              </p>
            </div>
          </div>

          {/* Cost Savings */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-amber-500/30 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-amber-400 uppercase tracking-wider">Cost Saved</span>
              </div>
              <div className="text-5xl font-bold text-white mb-2">
                ${animatedSavings.toLocaleString()}
              </div>
              <p className="text-gray-400">
                In support labor this week
              </p>
            </div>
          </div>
        </div>

        {/* Secondary stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="text-2xl font-bold text-white mb-1">{metrics.avgResponseTime}s</div>
            <div className="text-xs text-gray-400">Avg Response Time</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="text-2xl font-bold text-white mb-1">{metrics.customerSatisfaction}%</div>
            <div className="text-xs text-gray-400">Customer Satisfaction</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="text-2xl font-bold text-white mb-1">24/7</div>
            <div className="text-xs text-gray-400">Always Available</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="text-2xl font-bold text-white mb-1">{metrics.escalationRate}%</div>
            <div className="text-xs text-gray-400">Escalation Rate</div>
          </div>
        </div>

        {/* ROI Calculator teaser */}
        <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                Calculate Your ROI
              </h3>
              <p className="text-gray-400">
                See how much BitBit could save your business based on your current support volume
              </p>
            </div>
            <button className="px-6 py-3 bg-white text-slate-900 rounded-xl font-semibold hover:scale-105 transition-transform whitespace-nowrap">
              Coming Soon →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
