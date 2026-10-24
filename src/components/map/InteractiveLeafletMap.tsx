import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, ZoomIn, ZoomOut, Compass, AlertTriangle } from 'lucide-react';
import type { GISStand, StandMapStatus, ServicingState } from '../../types';

/** Escapes text placed into popup HTML — stand data can come from uploaded GeoJSON files. */
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const CONSTRAINT_LABELS: Record<string, string> = {
  WETLAND: 'EMA wetland reserve',
  POWER_WAYLEAVE: 'Electricity way-leave',
  ROAD_SERVITUDE: 'Road servitude',
  FLOOD_ZONE: 'Flood-prone drainage zone',
};
const servicingIcon = (s: ServicingState) => (s === 'CERTIFIED' ? '✅' : s === 'IN_PROGRESS' ? '🚧' : '⬜');

interface InteractiveLeafletMapProps {
  stands: GISStand[];
  selectedStandId: string;
  onSelectStand: (standId: string) => void;
  onReserveClick: (stand: GISStand) => void;
  center?: [number, number];
  zoom?: number;
}

// Visual status color mapping per ZNHSP requirements
export const getStatusColors = (status: StandMapStatus) => {
  switch (status) {
    case 'available':
      return {
        fill: '#10b981', // 🟢 Green
        stroke: '#059669',
        fillOpacity: 0.35,
        label: 'Available'
      };
    case 'pending_deposit':
      return {
        fill: '#f59e0b', // 🟡 Yellow
        stroke: '#d97706',
        fillOpacity: 0.45,
        label: 'Reserved · Deposit Pending'
      };
    case 'allocated':
      return {
        fill: '#3b82f6', // 🔵 Blue
        stroke: '#2563eb',
        fillOpacity: 0.45,
        label: 'Allocated'
      };
    case 'blocked':
      return {
        fill: '#ef4444', // 🔴 Red hatch
        stroke: '#dc2626',
        fillOpacity: 0.6,
        label: 'Non-buildable'
      };
    case 'disputed':
      return {
        fill: '#64748b', // Grey
        stroke: '#475569',
        fillOpacity: 0.5,
        label: 'Disputed'
      };
  }
};

// Offline procedural canvas tile layer for zero-internet environments
const createOfflineCanvasGrid = () => {
  const OfflineLayer = L.GridLayer.extend({
    createTile: function(coords: { x: number; y: number; z: number }) {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;
      const ctx = tile.getContext('2d');
      if (ctx) {
        // Deep GIS blueprint dark background
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, 256, 256);

        // Minor grid lines (32px intervals)
        ctx.strokeStyle = '#17223b';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let x = 0; x <= 256; x += 32) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 256);
        }
        for (let y = 0; y <= 256; y += 32) {
          ctx.moveTo(0, y);
          ctx.lineTo(256, y);
        }
        ctx.stroke();

        // Major grid border (256px tile bounds)
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(0, 0, 256, 256);

        // Geodetic Arc 1950 coordinate watermark
        ctx.fillStyle = '#334155';
        ctx.font = '9px monospace';
        ctx.fillText(`ARC-1950 UTM [${coords.z}/${coords.x}/${coords.y}]`, 8, 16);
      }
      return tile;
    }
  });
  return new (OfflineLayer as unknown as new (opts: L.GridLayerOptions) => L.GridLayer)({
    maxZoom: 22,
    minZoom: 1
  });
};

export const InteractiveLeafletMap: React.FC<InteractiveLeafletMapProps> = ({
  stands,
  selectedStandId,
  onSelectStand,
  onReserveClick,
  center = [-17.8925, 30.9325],
  zoom = 17
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.FeatureGroup | null>(null);
  const currentTileLayerRef = useRef<L.Layer | null>(null);
  const [mapTileTheme, setMapTileTheme] = useState<'offline' | 'dark' | 'osm'>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'offline'
  );
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [mapError, setMapError] = useState<string | null>(null);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setMapTileTheme('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Helper to attach appropriate tile layer without network errors
  const attachTileLayer = (map: L.Map, theme: 'offline' | 'dark' | 'osm') => {
    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
      currentTileLayerRef.current = null;
    }

    if (theme === 'offline') {
      const offlineLayer = createOfflineCanvasGrid();
      offlineLayer.addTo(map);
      currentTileLayerRef.current = offlineLayer;
    } else {
      const tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

      const layer = L.tileLayer(tileUrl, {
        maxZoom: 20,
        subdomains: 'abcd'
      });

      // Defensive fallback on tile download failure (e.g. no internet)
      layer.on('tileerror', (e) => {
        const img = e.tile as HTMLImageElement;
        if (img) {
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#070b14';
            ctx.fillRect(0, 0, 256, 256);
            ctx.strokeStyle = '#1e293b';
            ctx.strokeRect(0, 0, 256, 256);
            ctx.fillStyle = '#475569';
            ctx.font = '9px monospace';
            ctx.fillText('OFFLINE GIS CANVAS', 8, 16);
          }
          img.src = canvas.toDataURL();
        }
      });

      layer.addTo(map);
      currentTileLayerRef.current = layer;
    }

    if (geojsonLayerRef.current) {
      geojsonLayerRef.current.bringToFront();
    }
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: center,
          zoom: zoom,
          zoomControl: false,
          attributionControl: false,
          touchZoom: true,
          dragging: true
        });

        attachTileLayer(map, mapTileTheme);

        const featureGroup = L.featureGroup().addTo(map);
        geojsonLayerRef.current = featureGroup;
        mapInstanceRef.current = map;
      }
    } catch (err: unknown) {
      console.error('Leaflet initialization error:', err);
      setMapError('Failed to initialize WebGL/Canvas map. You can switch to Cadastre SVG or Grid View.');
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Tile Layer if theme changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    attachTileLayer(mapInstanceRef.current, mapTileTheme);
  }, [mapTileTheme]);

  // Fly to the newly selected development
  useEffect(() => {
    mapInstanceRef.current?.setView(center, zoom);
  }, [center[0], center[1], zoom]);

  // Render Stands as GeoJSON polygons & Popups
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = geojsonLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    stands.forEach(stand => {
      // Stands without a surveyed boundary are listed in the grid view but cannot be drawn.
      if (!stand.geometry || !stand.center_point) return;
      const isSelected = stand.id === selectedStandId;
      const colors = getStatusColors(stand.status);

      // GeoJSON Polygon coordinates are [lng, lat], Leaflet polygon needs [lat, lng]
      const leafletCoords = stand.geometry.coordinates[0].map(
        ([lng, lat]) => [lat, lng] as [number, number]
      );

      const polygon = L.polygon(leafletCoords, {
        color: isSelected ? '#38bdf8' : colors.stroke,
        weight: isSelected ? 3.5 : 2,
        fillColor: colors.fill,
        fillOpacity: isSelected ? 0.6 : colors.fillOpacity,
        dashArray: stand.status === 'blocked' ? '6, 6' : undefined
      });

      // Interactive popup with rich ZNHSP metrics & action CTA
      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-100 font-sans';

      const isWetland = stand.status === 'blocked' || stand.status === 'disputed';
      const isAvailable = stand.status === 'available';
      const isLocked = stand.status === 'pending_deposit';
      const sv = stand.servicing;

      popupContent.innerHTML = `
        <div style="font-family: inherit; min-width: 210px; max-width: 250px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: #f8fafc; font-weight: bold;">${esc(stand.stand_number)}</strong>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 9999px; font-weight: bold; background: ${colors.fill}; color: #ffffff;">
              ${colors.label}
            </span>
          </div>

          <div style="font-size: 11px; color: #94a3b8; font-family: monospace; margin-bottom: 6px;">
            <div>Area: <strong style="color: #f1f5f9;">${esc(stand.area_sqm)} m²</strong>${stand.dimensions ? ` (${esc(stand.dimensions)})` : ''}</div>
            ${isWetland ? '' : `<div>Price: <strong style="color: #34d399;">$${esc(stand.price_usd)} USD</strong> (Dep: $${esc(stand.required_deposit_usd)})</div>`}
            <div>Zoning: <span style="color: #818cf8;">${esc(stand.zoning_type.replace(/_/g, ' '))}</span> · Quota: ${esc(stand.quota_category)}</div>
            <div>Servicing: ${servicingIcon(sv.water)} water ${servicingIcon(sv.sewer)} sewer ${servicingIcon(sv.roads)} roads</div>
          </div>

          ${
            isWetland ? `
              <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 6px; font-size: 10px; color: #fca5a5; margin-bottom: 6px;">
                ⚠️ <strong>${esc(stand.land_constraint ? CONSTRAINT_LABELS[stand.land_constraint] : stand.status === 'disputed' ? 'Disputed' : 'Withdrawn')}:</strong> not available for booking.
              </div>
            ` : ''
          }

          ${
            stand.holder_name ? `
              <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.6); border-radius: 6px; padding: 6px; font-size: 10px; color: #cbd5e1; margin-bottom: 6px;">
                Beneficiary: <strong>${esc(stand.holder_name)}</strong><br/>
                Bal: <strong style="color: ${stand.balance_usd === 0 ? '#34d399' : '#fbbf24'};">$${esc(stand.balance_usd)} USD</strong>
              </div>
            ` : ''
          }

          ${
            !isWetland ? `
              <button id="cta-stand-${stand.id}" style="
                width: 100%;
                background: ${isAvailable ? 'linear-gradient(to right, #059669, #0d9488)' : '#4f46e5'};
                color: #ffffff;
                border: none;
                padding: 7px 10px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                margin-top: 4px;
              ">
                ${isAvailable ? '⚡ Reserve for an Approved Applicant' : isLocked ? '💳 Record Deposit Payment' : '💳 Record Instalment'}
              </button>
            ` : ''
          }
        </div>
      `;

      polygon.bindPopup(popupContent, {
        closeButton: true,
        className: 'zimbuild-custom-leaflet-popup'
      });

      polygon.on('popupopen', () => {
        const ctaBtn = document.getElementById(`cta-stand-${stand.id}`);
        if (ctaBtn) {
          ctaBtn.onclick = (e) => {
            e.stopPropagation();
            onSelectStand(stand.id);
            onReserveClick(stand);
          };
        }
      });

      polygon.on('click', () => {
        onSelectStand(stand.id);
      });

      // Stand centroid label marker
      const center = stand.center_point;
      const markerIcon = L.divIcon({
        className: 'custom-stand-div-icon',
        html: `
          <div style="
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid ${isSelected ? '#38bdf8' : colors.stroke};
            color: ${isSelected ? '#38bdf8' : '#e2e8f0'};
            font-size: 10px;
            font-family: monospace;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 4px;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            transform: translate(-50%, -50%);
          ">
            ${esc(stand.stand_number)}
          </div>
        `,
        iconSize: [0, 0]
      });

      const marker = L.marker([center[0], center[1]], { icon: markerIcon });
      marker.on('click', () => {
        onSelectStand(stand.id);
        polygon.openPopup();
      });

      group.addLayer(polygon);
      group.addLayer(marker);

      if (isSelected) {
        polygon.bringToFront();
      }
    });

  }, [stands, selectedStandId, onSelectStand, onReserveClick]);

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(center, zoom);
    }
  };

  if (mapError) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-slate-950/80 rounded-xl border border-rose-900/40 text-slate-300">
        <AlertTriangle className="w-10 h-10 text-rose-400 mb-2" />
        <h3 className="font-bold text-sm text-slate-100">Map Rendering Issue</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[360px] rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950">
      
      {/* Leaflet Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Controls & Overlays */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col space-y-1.5">
        <button
          onClick={handleZoomIn}
          aria-label="Zoom In"
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg shadow-lg backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          aria-label="Zoom Out"
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg shadow-lg backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleRecenter}
          aria-label="Reset View"
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg shadow-lg backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Reset View"
        >
          <Compass className="w-4 h-4" />
        </button>
        <button
          onClick={() => setMapTileTheme(prev => prev === 'offline' ? 'dark' : prev === 'dark' ? 'osm' : 'offline')}
          aria-label={`Switch Map Theme. Active: ${mapTileTheme}`}
          className={`p-2 rounded-lg shadow-lg backdrop-blur border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            mapTileTheme === 'offline' 
              ? 'bg-emerald-950/90 text-emerald-400 border-emerald-600/80' 
              : 'bg-slate-900/90 hover:bg-slate-800 text-indigo-400 border-slate-700/80'
          }`}
          title={`Active: ${mapTileTheme.toUpperCase()} (Click to switch Offline/Dark/Street)`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Real-time Cadastre Legend */}
      <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-[400] bg-slate-950/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800/80 text-[10px] font-mono shadow-2xl flex flex-wrap items-center gap-3">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm" />
          <span className="text-slate-300 font-medium">Available (Open for Booking)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shadow-sm" />
          <span className="text-slate-300 font-medium">Reserved (Deposit Window)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shadow-sm" />
          <span className="text-slate-300 font-medium">Allocated (Instalment Active)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-sm" />
          <span className="text-rose-300 font-medium">Wetland / Way-leave / Servitude (Protected)</span>
        </div>
      </div>

      {/* Offline Status & Gesture Tips */}
      <div className="absolute top-3 left-3 z-[400] flex items-center space-x-2">
        <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono flex items-center space-x-1.5 backdrop-blur shadow-md ${
          mapTileTheme === 'offline' || isOffline
            ? 'bg-slate-950/90 border-emerald-500/60 text-emerald-400'
            : 'bg-slate-950/90 border-slate-700/80 text-indigo-300'
        }`}>
          <span className={`w-2 h-2 rounded-full ${mapTileTheme === 'offline' || isOffline ? 'bg-emerald-400' : 'bg-cyan-400 animate-pulse'}`} />
          <span>{mapTileTheme === 'offline' ? 'Offline GIS Engine (Zero Internet)' : mapTileTheme === 'dark' ? 'CartoDB Dark Tiles' : 'OSM Street Tiles'}</span>
        </div>
      </div>

    </div>
  );
};
