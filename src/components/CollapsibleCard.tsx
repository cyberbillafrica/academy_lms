'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleCardProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  className = '',
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-6 py-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors border-b border-gray-100"
      >
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <button
          type="button"
          className="text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* Content */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}