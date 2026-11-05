import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { GisLayer } from '../../types/gis';
import { groupLayersByCatalogModule } from '../../gis/catalogWorkspaces';

interface SavedLayersHoverMenuProps {
  title: string;
  layers: GisLayer[];
  onRemove: (layerId: string) => void;
  /** Clears every layer currently shown in this destination hover list. */
  onUnselectAll?: () => void;
  emptyHint?: string;
  children: React.ReactNode;
  testId?: string;
}

/**
 * Hover popover for Save-to-* buttons: lists assigned layers by catalog module; remove-only.
 */
export const SavedLayersHoverMenu: React.FC<SavedLayersHoverMenuProps> = ({
  title,
  layers,
  onRemove,
  onUnselectAll,
  emptyHint = 'No layers selected.',
  children,
  testId,
}) => {
  const [open, setOpen] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const layersKey = layers.map((l) => l.id).join('|');
  const moduleGroups = useMemo(() => groupLayersByCatalogModule(layers), [layers]);

  useEffect(() => {
    return () => {
      if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  const clearLeave = () => {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const onEnter = () => {
    clearLeave();
    setOpen(true);
  };

  const onLeave = () => {
    clearLeave();
    leaveTimer.current = window.setTimeout(() => {
      setOpen(false);
      leaveTimer.current = null;
    }, 180);
  };

  return (
    <div
      className="relative inline-flex"
      data-testid={testId}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
      }}
    >
      {children}
      {open && (
        <div
          key={layersKey}
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-full mt-1 z-[80] w-80 max-h-72 overflow-hidden rounded border border-outline-variant/50 bg-surface-container-lowest shadow-lg"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-outline-variant/30">
            <div className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {title}
              <span className="ml-1 font-mono normal-case tracking-normal">({layers.length})</span>
            </div>
            <button
              type="button"
              data-testid="saved-layers-unselect-all"
              disabled={layers.length === 0 || !onUnselectAll}
              className="shrink-0 text-[10px] font-semibold text-error hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
              title="Unselect all layers in this destination list"
              onClick={(e) => {
                e.stopPropagation();
                onUnselectAll?.();
              }}
            >
              Unselect all
            </button>
          </div>
          {layers.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-on-surface-variant leading-snug">{emptyHint}</p>
          ) : (
            <div className="overflow-y-auto max-h-56 py-1">
              {moduleGroups.map((group) => (
                <div key={group.id} data-testid={`saved-layer-module-${group.id}`}>
                  <div className="px-2.5 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-secondary">
                    {group.label}
                    <span className="ml-1 font-mono normal-case tracking-normal text-on-surface-variant">
                      ({group.layers.length})
                    </span>
                  </div>
                  <ul>
                    {group.layers.map((layer) => (
                      <li
                        key={layer.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-surface-container-low"
                      >
                        <span
                          className="flex-1 min-w-0 truncate font-medium text-primary"
                          title={`${layer.name} · ${group.label}`}
                        >
                          {layer.name}
                        </span>
                        <button
                          type="button"
                          data-testid={`saved-layer-remove-${layer.id}`}
                          className="shrink-0 p-0.5 rounded text-error hover:bg-error/10 cursor-pointer"
                          title={`Remove ${layer.name} from this destination`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(layer.id);
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="px-2.5 py-1 border-t border-outline-variant/25 text-[9px] text-on-surface-variant">
            Remove only — add layers from the catalog table, then Save.
          </p>
        </div>
      )}
    </div>
  );
};
