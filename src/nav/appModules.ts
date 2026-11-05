/**
 * EAGLE GIS application module hierarchy (M1–M4).
 * Aligned to GIS_Project_Sample_Data_and_Features.docx + project navigation.
 */
import type { ComponentType } from 'react';
import {
  BookOpen,
  Compass,
  Edit3,
  FileBarChart2,
  Grid,
  Layers,
  Activity,
  LayoutDashboard,
  Map as MapIcon,
  Navigation2,
  Route,
  Satellite,
  Share2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { WorkspaceId } from '../types/gis';

export interface AppNavItem {
  id: WorkspaceId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface AppNavSection {
  id: 'm1' | 'm2' | 'm3' | 'm4';
  title: string;
  items: AppNavItem[];
}

export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'm1',
    title: 'Situation Awareness',
    items: [
      {
        id: 'ndps-spatial-dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
      },
      {
        id: 'ndps-analytics',
        label: 'NDPS Analytics',
        icon: Activity,
      },
      { id: 'interactive-map', label: 'Interactive Map', icon: MapIcon },
    ],
  },
  {
    id: 'm2',
    title: 'Layers & Data',
    items: [
      { id: 'administrative-layers', label: 'Administrative Layers', icon: Layers },
      { id: 'operational-layers', label: 'Operational (OPS) Layers', icon: Route },
      { id: 'road-network-layers', label: 'Road Network Layers', icon: Compass },
      { id: 'roads-routing', label: 'Roads Routing', icon: Navigation2 },
      { id: 'roads-routing-new', label: 'Roads Routing New', icon: Satellite },
      { id: 'raster-imagery', label: 'Raster & Imagery', icon: Grid },
      { id: 'import-export', label: 'Import & Export', icon: Upload },
      { id: 'feature-editor', label: 'Feature Editor', icon: Edit3 },
    ],
  },
  {
    id: 'm3',
    title: 'Products & Field',
    items: [
      { id: 'atlas-map-books', label: 'Atlas & Map Books', icon: BookOpen },
      { id: 'reports-seizure-analytics', label: 'Reports & Seizure Analytics', icon: FileBarChart2 },
      { id: 'mobile-locus-export', label: 'Mobile / Locus Export', icon: Share2 },
    ],
  },
  {
    id: 'm4',
    title: 'System & Governance',
    items: [{ id: 'users-audit-trail', label: 'Users & Audit Trail', icon: ShieldCheck }],
  },
];

export const ALL_APP_WORKSPACES: WorkspaceId[] = APP_NAV_SECTIONS.flatMap((s) =>
  s.items.map((i) => i.id)
);
