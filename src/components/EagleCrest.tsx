import React, { useState, useEffect } from 'react';
import { InspectableFeature } from '../types/gis';

export const EagleCrest: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="EAGLE Force Andhra Pradesh Crest"
    >
      {/* Outer Tactical Shield */}
      <path
        d="M24 3L6 9.5V22.5C6 33.8 13.7 42.9 24 46C34.3 42.9 42 33.8 42 22.5V9.5L24 3Z"
        fill="#001428"
        stroke="#0f2942"
        strokeWidth="1.5"
      />
      {/* Inner Gold/Teal Trim Shield */}
      <path
        d="M24 6.2L9.2 11.6V22.4C9.2 31.8 15.5 39.6 24 42.4C32.5 39.6 38.8 31.8 38.8 22.4V11.6L24 6.2Z"
        fill="#0f2942"
        stroke="#d4af37"
        strokeWidth="1.1"
      />
      {/* Geospatial Latitude/Longitude Globe Ring */}
      <circle cx="24" cy="23" r="9.5" stroke="#006a61" strokeWidth="1.1" strokeOpacity="0.85" />
      <ellipse cx="24" cy="23" rx="4.8" ry="9.5" stroke="#86f2e4" strokeWidth="0.7" strokeOpacity="0.55" />
      <line x1="14.5" y1="23" x2="33.5" y2="23" stroke="#86f2e4" strokeWidth="0.7" strokeOpacity="0.55" />
      {/* Stylized Sovereign Eagle Wings */}
      <path
        d="M12.5 19.5C15.8 19.2 18.8 20.6 21.2 22.8L24 16.5L26.8 22.8C29.2 20.6 32.2 19.2 35.5 19.5C33.8 23.2 30.8 25.4 26.8 26.2L28.5 31.5L24 28.8L19.5 31.5L21.2 26.2C17.2 25.4 14.2 23.2 12.5 19.5Z"
        fill="#f8fafc"
      />
      {/* Sovereign Gold Crown Star */}
      <polygon
        points="24,9.5 25.1,12.1 27.9,12.3 25.7,14.1 26.4,16.8 24,15.3 21.6,16.8 22.3,14.1 20.1,12.3 22.9,12.1"
        fill="#fbbf24"
      />
    </svg>
  );
};

export const ReconFeedCard: React.FC<{ feature: InspectableFeature }> = ({ feature }) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [feature.id, feature.imageUrl]);

  const showExternalImage = Boolean(feature.imageUrl && !imgFailed);

  return (
    <div className="rounded overflow-hidden border border-outline-variant/40 bg-primary relative h-28 w-full select-none">
      {/* Vector Tactical Aerial / Satellite Scene Backdrop (Always ready & instant) */}
      <svg
        viewBox="0 0 360 120"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        {feature.sceneTheme === 'ghat-checkpost' && (
          <g>
            <defs>
              <linearGradient id="ghatBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1e3a2f" />
                <stop offset="55%" stopColor="#2c4c3b" />
                <stop offset="100%" stopColor="#162923" />
              </linearGradient>
            </defs>
            <rect width="360" height="120" fill="url(#ghatBg)" />
            {/* Forested Hill Contours */}
            <path d="M0,30 Q90,5 180,35 T360,20 L360,120 L0,120 Z" fill="#234233" opacity="0.8" />
            <path d="M0,65 Q120,40 230,72 T360,55 L360,120 L0,120 Z" fill="#183024" opacity="0.9" />
            {/* Winding Hairpin Ghat Highway SH-39 */}
            <path
              d="M 40,120 C 95,88 265,92 290,56 C 308,30 160,28 195,0"
              fill="none"
              stroke="#64748b"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d="M 40,120 C 95,88 265,92 290,56 C 308,30 160,28 195,0"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1.2"
              strokeDasharray="6,5"
            />
            {/* Checkpost Barricade & ANPR Gantry */}
            <rect x="172" y="72" width="38" height="7" rx="1" fill="#006a61" stroke="#86f2e4" strokeWidth="1" />
            <rect x="152" y="78" width="14" height="8" rx="1" fill="#f8fafc" />
            <rect x="215" y="65" width="16" height="8" rx="1" fill="#fbbf24" />
            {/* ANPR Bounding Reticle */}
            <rect
              x="211"
              y="61"
              width="24"
              height="16"
              fill="none"
              stroke="#86f2e4"
              strokeWidth="1"
              strokeDasharray="3,2"
            />
          </g>
        )}

        {feature.sceneTheme === 'forest-hotspot' && (
          <g>
            <rect width="360" height="120" fill="#181826" />
            {/* Thermal IR Canopy Contours */}
            <path d="M0,25 Q80,55 170,25 T360,40 L360,120 L0,120 Z" fill="#242038" />
            <path d="M30,115 Q130,65 210,75 T330,18" fill="none" stroke="#ba1a1a" strokeWidth="2" strokeDasharray="5,4" />
            {/* Thermal Heat Signatures */}
            <circle cx="165" cy="64" r="18" fill="#ba1a1a" opacity="0.25" />
            <circle cx="165" cy="64" r="7" fill="#ef4444" opacity="0.85" />
            <circle cx="188" cy="58" r="4.5" fill="#f97316" opacity="0.9" />
            <circle cx="148" cy="72" r="4" fill="#fbbf24" opacity="0.9" />
            {/* UAV Crosshair */}
            <line x1="140" y1="64" x2="190" y2="64" stroke="#86f2e4" strokeWidth="0.7" opacity="0.7" />
            <line x1="165" y1="42" x2="165" y2="86" stroke="#86f2e4" strokeWidth="0.7" opacity="0.7" />
            <rect x="148" y="48" width="34" height="32" fill="none" stroke="#86f2e4" strokeWidth="0.9" />
          </g>
        )}

        {feature.sceneTheme === 'highway-plaza' && (
          <g>
            <rect width="360" height="120" fill="#1b2838" />
            {/* 6-Lane NH-16 Perspective */}
            <polygon points="135,0 225,0 330,120 30,120" fill="#334155" />
            <line x1="180" y1="0" x2="180" y2="120" stroke="#fbbf24" strokeWidth="2" />
            <line x1="158" y1="0" x2="105" y2="120" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="7,6" />
            <line x1="202" y1="0" x2="255" y2="120" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="7,6" />
            {/* Overhead ANPR Gantry */}
            <rect x="70" y="34" width="220" height="6" fill="#0f2942" stroke="#86f2e4" strokeWidth="0.8" />
            {/* Tracked Cargo Vehicle */}
            <rect x="198" y="58" width="26" height="16" rx="2" fill="#e2e8f0" />
            <rect x="194" y="54" width="34" height="24" fill="none" stroke="#ef4444" strokeWidth="1.2" />
          </g>
        )}

        {feature.sceneTheme === 'urban-hq' && (
          <g>
            <rect width="360" height="120" fill="#0f2338" />
            {/* Urban Street Blocks & NOC Grid */}
            <g stroke="#1e3a5f" strokeWidth="1">
              <line x1="0" y1="30" x2="360" y2="30" />
              <line x1="0" y1="60" x2="360" y2="60" />
              <line x1="0" y1="90" x2="360" y2="90" />
              <line x1="70" y1="0" x2="70" y2="120" />
              <line x1="140" y1="0" x2="140" y2="120" />
              <line x1="210" y1="0" x2="210" y2="120" />
              <line x1="280" y1="0" x2="280" y2="120" />
            </g>
            <rect x="148" y="36" width="54" height="42" rx="2" fill="#164e63" stroke="#86f2e4" strokeWidth="1.2" />
            <circle cx="175" cy="57" r="26" fill="none" stroke="#86f2e4" strokeWidth="0.8" strokeDasharray="4,3" />
          </g>
        )}

        {feature.sceneTheme === 'valley-polygon' && (
          <g>
            <rect width="360" height="120" fill="#1c3128" />
            <path d="M0,20 Q110,50 220,18 T360,35 L360,120 L0,120 Z" fill="#274437" />
            <polygon
              points="115,32 215,24 238,76 132,86"
              fill="#4f46e5"
              fillOpacity="0.32"
              stroke="#a5b4fc"
              strokeWidth="1.5"
              strokeDasharray="4,2"
            />
            <text x="145" y="58" fill="#e0e7ff" fontSize="9" fontFamily="monospace">
              NDVI Δ -0.42
            </text>
          </g>
        )}
      </svg>

      {/* External Aerial Surveillance Image when available */}
      {showExternalImage && (
        <img
          src={feature.imageUrl}
          alt={feature.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Measured Contrast Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/25 to-transparent" />

      {/* Top-Left Live Timestamp Telemetry */}
      <div className="absolute top-1.5 left-2 right-2 flex items-center justify-between text-[9px] font-mono text-white/85 tabular-coord">
        <span className="bg-primary/65 px-1.5 py-0.5 rounded backdrop-blur-xs">
          REC • {feature.lat.toFixed(4)}°N {feature.lon.toFixed(4)}°E
        </span>
        <span className="bg-primary/65 px-1.5 py-0.5 rounded backdrop-blur-xs">
          ELV {feature.elevationM}m
        </span>
      </div>

      {/* Bottom Camera Metadata Overlay */}
      <div className="absolute bottom-1.5 left-2 right-2 flex justify-between items-end text-white text-[10px]">
        <div className="min-w-0 pr-2">
          <span className="block font-semibold uppercase tracking-wider text-secondary-fixed truncate text-[10px]">
            {feature.camLabel}
          </span>
          <span className="font-mono text-[9px] text-white/85 truncate block tabular-coord">
            {feature.camSublabel}
          </span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-error text-white text-[8.5px] uppercase font-bold tracking-wider shrink-0">
          {feature.camTag}
        </span>
      </div>
    </div>
  );
};
