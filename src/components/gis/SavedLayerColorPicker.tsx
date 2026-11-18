import React, { useRef } from 'react';
import { Palette } from 'lucide-react';
import { pickerColorForLayer } from '../../gis/layerColor';

interface SavedLayerColorPickerProps {
  layerId: string;
  /** Saved custom hex, if any. */
  color?: string;
  onChange: (color: string) => void;
  title?: string;
}

/** Colour chip + native picker; sits immediately before the Delete control. */
export const SavedLayerColorPicker: React.FC<SavedLayerColorPickerProps> = ({
  layerId,
  color,
  onChange,
  title = 'Layer colour',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const value = pickerColorForLayer(layerId, color);

  return (
    <span className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        className="cursor-pointer p-0.5 rounded hover:bg-surface-container-high"
        title={title}
        aria-label={title}
        onClick={() => inputRef.current?.click()}
      >
        <Palette className="w-3.5 h-3.5" style={{ color: value }} strokeWidth={2.25} />
      </button>
      <input
        ref={inputRef}
        type="color"
        value={value}
        aria-label={title}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
};
