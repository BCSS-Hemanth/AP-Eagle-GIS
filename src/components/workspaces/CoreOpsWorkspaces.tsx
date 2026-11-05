import React from 'react';
import { GisLayer, WorkspaceId } from '../../types/gis';
import { NdpsHeatMapDashboard } from './NdpsHeatMapDashboard';

interface CoreOpsProps {
  workspace: 'ndps-spatial-dashboard';
  dashboardLayers: GisLayer[];
  onSelectFeatureAndFly: (featureId: string) => void;
  onFlyToLocation?: (lat: number, lon: number, label: string) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
  dashboardMapExpanded?: boolean;
  onDashboardMapExpandedChange?: (expanded: boolean) => void;
}

export const CoreOpsWorkspaces: React.FC<CoreOpsProps> = ({
  dashboardLayers,
  onSelectFeatureAndFly,
  onFlyToLocation,
  onSwitchWorkspace,
  onTriggerToast,
  dashboardMapExpanded = false,
  onDashboardMapExpandedChange,
}) => (
  <NdpsHeatMapDashboard
    layers={dashboardLayers}
    onSelectFeatureAndFly={onSelectFeatureAndFly}
    onFlyToLocation={onFlyToLocation}
    onSwitchWorkspace={onSwitchWorkspace}
    onTriggerToast={onTriggerToast}
    mapExpanded={dashboardMapExpanded}
    onMapExpandedChange={onDashboardMapExpandedChange}
  />
);
