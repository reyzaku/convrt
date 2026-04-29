'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const VideoConverter = dynamic(() => import('@/components/VideoConverter'), { ssr: false });
const VideoToGif = dynamic(() => import('@/components/VideoToGif'), { ssr: false });
const GifOptimizer = dynamic(() => import('@/components/GifOptimizer'), { ssr: false });
const VideoCompressor = dynamic(() => import('@/components/VideoCompressor'), { ssr: false });

const TABS = [
  { id: 'converter', label: 'Video Converter', icon: '🎞️' },
  { id: 'to-gif', label: 'Video → GIF', icon: '🎨' },
  { id: 'gif-optimizer', label: 'GIF Optimizer', icon: '⚡' },
  { id: 'compressor', label: 'Compressor', icon: '📦' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('converter');

  return (
    <main className="min-h-screen" style={{ background: '#0D0D0D' }}>
      {/* Header */}
      <header className="border-b border-zinc-900 px-4 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              CONV<span style={{ color: '#E85D20' }}>RT</span>
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">Browser-based · No upload · 100% private</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-600 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Powered by FFmpeg.wasm
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="border-b border-zinc-900 overflow-x-auto">
        <div className="max-w-2xl mx-auto flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-[#E85D20] text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tool panel */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">
            {TABS.find((t) => t.id === activeTab)?.label}
          </h2>
          <p className="text-sm text-zinc-600 mt-0.5">
            {activeTab === 'converter' && 'Convert between video formats locally in your browser.'}
            {activeTab === 'to-gif' && 'Turn any video clip into a high-quality animated GIF.'}
            {activeTab === 'gif-optimizer' && 'Reduce GIF file size by optimizing palette and dimensions.'}
            {activeTab === 'compressor' && 'Shrink video files with fine-grained quality control.'}
          </p>
        </div>

        {activeTab === 'converter' && <VideoConverter />}
        {activeTab === 'to-gif' && <VideoToGif />}
        {activeTab === 'gif-optimizer' && <GifOptimizer />}
        {activeTab === 'compressor' && <VideoCompressor />}
      </div>

      {/* Footer */}
      <footer className="text-center pb-8 text-xs text-zinc-700">
        Files never leave your machine — all processing happens in the browser.
      </footer>
    </main>
  );
}
