'use client'

import { SFBolt, SFChartBar, SFCheckmarkCircle, SFExclamationmarkTriangle, SFShippingbox, SFTimer, SFTag, SFWrenchAndScrewdriver, SFScissors, SFClock, SFDollarsignCircle, SFPerson2 } from 'sf-symbols-lib'
import { AIButton } from '../ai-button'
import {
  ProgressRingIcon,
  StatCard,
  MiniBarChart,
  MiniSparkline,
  MiniDonut,
  MiniGauge,
  StatusBadge,
  DataConnector,
  TimelineBar,
  ProcessPipeline,
  GlowIndicator,
  KPIWidget,
  HatchPattern,
} from './index'

const sampleSparkline = [12, 18, 15, 22, 28, 25, 32, 30, 35, 40, 38, 42]
const sampleBars = [
  { label: 'Mon', value: 65 },
  { label: 'Tue', value: 82 },
  { label: 'Wed', value: 71 },
  { label: 'Thu', value: 90 },
  { label: 'Fri', value: 55 },
  { label: 'Sat', value: 40 },
]

export function DataVizShowcase() {
  return (
    <div
      style={{
        padding: 40,
        background: 'var(--bg-primary)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <h2 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: 0 }}>
        BitBit Data Viz Component Library
      </h2>

      {/* Section: Progress Ring Icons */}
      <Section title="ProgressRingIcon">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <ProgressRingIcon value={75} icon={<SFBolt size={18} />} color="var(--bb-orange)" />
          <ProgressRingIcon value={45} icon={<SFChartBar size={18} />} color="var(--bb-blue)" />
          <ProgressRingIcon value={90} icon={<SFCheckmarkCircle size={18} />} color="var(--bb-green)" />
          <ProgressRingIcon value={20} icon={<SFExclamationmarkTriangle size={18} />} color="var(--bb-red)" />
        </div>
      </Section>

      {/* Section: StatCard with embedded charts */}
      <Section title="StatCard + Embedded Visualizations">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <StatCard
            label="Units Produced"
            value="1,247"
            color="var(--bb-teal)"
            chart={<MiniBarChart data={sampleBars} showLabels color="var(--bb-teal)" />}
          />

          <StatCard
            label="Efficiency Rate"
            value="94.2"
            unit="%"
            color="var(--bb-green)"
            chart={<MiniSparkline data={sampleSparkline} color="var(--bb-green)" />}
          />

          <StatCard
            label="Error Rate"
            value="3.1"
            unit="%"
            color="var(--bb-red)"
            chart={
              <MiniDonut
                segments={[
                  { value: 3.1, color: 'var(--bb-red)' },
                  { value: 96.9, color: 'rgba(255,255,255,0.06)' },
                ]}
                size={56}
                centerLabel="3.1%"
              />
            }
          />

          <StatCard
            label="Cycle Time"
            value="42"
            unit="sec"
            color="var(--bb-amber)"
            chart={<MiniGauge value={70} color="var(--bb-amber)" label="Target: 60s" />}
          />
        </div>
      </Section>

      {/* Section: Mini Charts standalone */}
      <Section title="Mini Charts">
        <div style={{ display: 'flex', gap: 32, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <Label>MiniBarChart</Label>
            <MiniBarChart data={sampleBars} showLabels />
          </div>
          <div>
            <Label>MiniSparkline</Label>
            <MiniSparkline data={sampleSparkline} />
          </div>
          <div>
            <Label>MiniDonut</Label>
            <MiniDonut
              segments={[
                { value: 60, color: 'var(--bb-orange)' },
                { value: 25, color: 'var(--bb-blue)' },
                { value: 15, color: 'var(--bb-purple)' },
              ]}
              size={56}
              centerLabel="60%"
            />
          </div>
          <div>
            <Label>MiniGauge</Label>
            <MiniGauge value={78} label="CPU" />
          </div>
          <div>
            <Label>HatchPattern</Label>
            <svg width={60} height={40}>
              <HatchPattern id="demo-hatch" />
              <rect width={60} height={40} fill="url(#demo-hatch)" rx={4} />
            </svg>
          </div>
        </div>
      </Section>

      {/* Section: Status & Glow */}
      <Section title="StatusBadge & GlowIndicator">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge label="Active" color="var(--bb-green)" glow />
          <StatusBadge label="Warning" color="var(--bb-amber)" glow />
          <StatusBadge label="Error" color="var(--bb-red)" glow />
          <StatusBadge label="Idle" color="var(--text-dim)" />
          <div style={{ display: 'flex', gap: 8, marginLeft: 16, alignItems: 'center' }}>
            <GlowIndicator color="var(--bb-green)" />
            <GlowIndicator color="var(--bb-orange)" />
            <GlowIndicator color="var(--bb-red)" pulse={false} />
          </div>
        </div>
      </Section>

      {/* Section: DataConnector */}
      <Section title="DataConnector">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Node A</span>
          <DataConnector status="active" width={80} />
          <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Node B</span>
          <DataConnector status="warning" width={80} />
          <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Node C</span>
          <DataConnector status="error" width={80} />
          <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Node D</span>
        </div>
      </Section>

      {/* Section: ProcessPipeline */}
      <Section title="ProcessPipeline">
        <ProcessPipeline
          stages={[
            { label: 'Packing', sublabel: 'Line 03', status: 'active', icon: <SFShippingbox size={16} /> },
            { label: 'Labelling', sublabel: 'Line 03', status: 'active', icon: <SFTag size={16} /> },
            { label: 'Riveting', sublabel: 'Line 03', status: 'warning', icon: <SFWrenchAndScrewdriver size={16} /> },
            { label: 'Cutting', sublabel: 'Line 03', status: 'error', icon: <SFScissors size={16} /> },
          ]}
        />
      </Section>

      {/* Section: TimelineBar */}
      <Section title="TimelineBar">
        <TimelineBar
          startLabel="10:00"
          endLabel="11:00"
          selection={[0.33, 0.72]}
          events={[
            { position: 0.05, color: 'var(--bb-red)', label: 'Alert' },
            { position: 0.45, color: 'var(--bb-amber)', label: 'Warning' },
            { position: 0.8, color: 'var(--bb-red)', label: 'Alert' },
          ]}
          ticks={[
            { position: 0, label: '10:00' },
            { position: 0.25, label: '10:15' },
            { position: 0.5, label: '10:30' },
            { position: 0.75, label: '10:45' },
            { position: 1, label: '11:00' },
          ]}
        />
      </Section>

      {/* Section: KPIWidget */}
      <Section title="KPIWidget">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <KPIWidget
            label="Accumulated Working Hours"
            value="201"
            unit="h"
            trend="up"
            trendValue="+12%"
            sparklineData={sampleSparkline}
            color="var(--bb-teal)"
            icon={<SFClock size={16} />}
          />
          <KPIWidget
            label="Revenue"
            value="$42.8k"
            trend="up"
            trendValue="+8.3%"
            sparklineData={[20, 25, 22, 30, 28, 35, 40, 38, 42]}
            color="var(--bb-green)"
            icon={<SFDollarsignCircle size={16} />}
          />
          <KPIWidget
            label="Active Users"
            value="2,847"
            trend="down"
            trendValue="-2.1%"
            sparklineData={[50, 48, 45, 42, 44, 40, 38]}
            color="var(--bb-orange)"
            icon={<SFPerson2 size={16} />}
          />
        </div>
      </Section>
      {/* Section: AI Button */}
      <Section title="AIButton (Magic/AI Actions)">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <AIButton size="sm">Small AI Action</AIButton>
          <AIButton size="md">Generate Report ✨</AIButton>
          <AIButton size="lg">Run Full Analysis</AIButton>
          <AIButton size="md" disabled>Disabled State</AIButton>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          color: 'var(--bb-orange)',
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 16,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: 'var(--text-secondary)',
        marginBottom: 6,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {children}
    </div>
  )
}
