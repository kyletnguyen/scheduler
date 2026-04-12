import { useState, useRef, useEffect } from 'react';
import type { Station } from '../../types';
import type { StationDisplay } from '../../utils/stationStyles';

interface Props {
  station: Station;
  currentStyle: StationDisplay;
  onSave: (color: string, abbr: string) => void;
  onClose: () => void;
}

export default function StationStyleEditor({ station, currentStyle, onSave, onClose }: Props) {
  const [color, setColor] = useState(currentStyle.color);
  const [abbr, setAbbr] = useState(currentStyle.abbr);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div ref={panelRef} className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">
          Customize {station.name}
        </h3>

        {/* Preview */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
          <span
            className="w-8 h-6 rounded text-xs font-bold flex items-center justify-center text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            {abbr}
          </span>
          <span className="text-sm text-gray-600">{station.name}</span>
        </div>

        {/* Abbreviation */}
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Abbreviation (1-4 chars)
        </label>
        <input
          type="text"
          value={abbr}
          onChange={(e) => setAbbr(e.target.value.toUpperCase().slice(0, 4))}
          maxLength={4}
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />

        {/* Color picker */}
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Color
        </label>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-10 rounded cursor-pointer border border-gray-300 p-0.5"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor(v);
            }}
            maxLength={7}
            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (abbr.trim().length === 0) return;
              if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
              onSave(color, abbr.trim());
            }}
            disabled={abbr.trim().length === 0 || !/^#[0-9a-fA-F]{6}$/.test(color)}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
