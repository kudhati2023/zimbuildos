import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, ZoomIn, ZoomOut, Compass, AlertTriangle, Droplets, Zap, GitCommit, Eye, EyeOff, HardHat } from 'lucide-react';
import type { GISStand, StandMapStatus, ServicingState, UtilityFeatureCollection } from '../../types';
import { fetchUtilityInfrastructure } from '../../api';

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

export type MapColorMode = 'cadastre' | 'infrastructure';

interface InteractiveLeafletMapProps {
  stands: GISStand[];
  selectedStandId: string;
  onSelectStand: (standId: string) => void;
  onReserveClick: (stand: GISStand) => void;
  center?: [number, number];
  zoom?: number;
  developmentId?: string;
  colorMode?: MapColorMode;
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

/** Visual coloring based on civil engineering infrastructure development stage */
export const getInfrastructureColors = (servicing: { water: ServicingState; sewer: ServicingState; roads: ServicingState }, landConstraint: string | null) => {
  if (landConstraint) {
    return {
      fill: '#ef4444',
      stroke: '#dc2626',
      fillOpacity: 0.6,
      label: 'Protected (No Servicing)'
    };
  }
  const states = [servicing.water, servicing.sewer, servicing.roads];
  const certifiedCount = states.filter(s => s === 'CERTIFIED').length;
  const inProgressCount = states.filter(s => s === 'IN_PROGRESS').length;

  if (certifiedCount === 3) {
    return {
      fill: '#06b6d4', // 🔵 Cyan: Fully Certified Serviced
      stroke: '#0891b2',
      fillOpacity: 0.55,
      label: 'Fully Serviced (Water+Sewer+Roads)'
    };
  }
  if (certifiedCount > 0 || inProgressCount > 0) {
    return {
      fill: '#f59e0b', // 🟡 Amber: Civil Works In Progress
      stroke: '#d97706',
      fillOpacity: 0.5,
      label: `Works in Progress (${certifiedCount}/3 Certified)`
    };
  }
  return {
    fill: '#64748b', // ⚪ Slate/Grey: Unserviced Virgin Stand
    stroke: '#475569',
    fillOpacity: 0.35,
    label: 'Unserviced (Planned Reticulation)'
  };
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
  zoom = 17,
  developmentId,
  colorMode: initialColorMode = 'cadastre'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.FeatureGroup | null>(null);
  const utilityLayerRef = useRef<L.FeatureGroup | null>(null);
  const currentTileLayerRef = useRef<L.Layer | null>(null);
  const [mapTileTheme, setMapTileTheme] = useState<'offline' | 'dark' | 'osm' | 'satellite'>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'offline'
  );
  const [activeColorMode, setActiveColorMode] = useState<MapColorMode>(initialColorMode);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [mapError, setMapError] = useState<string | null>(null);

  // Sync color mode if changed from prop
  useEffect(() => {
    if (initialColorMode) {
      setActiveColorMode(initialColorMode);
    }
  }, [initialColorMode]);

  // Utility infrastructure layer controls
  const [utilitiesData, setUtilitiesData] = useState<UtilityFeatureCollection | null>(null);
  const [showWater, setShowWater] = useState(true);
  const [showSewer, setShowSewer] = useState(true);
  const [showPower, setShowPower] = useState(true);
  const [showConnectors, setShowConnectors] = useState(false);
  const [isUtilitiesMenuOpen, setIsUtilitiesMenuOpen] = useState(false);

  // Fetch utilities infrastructure when developmentId changes
  useEffect(() => {
    if (!developmentId) {
      setUtilitiesData(null);
      return;
    }
    let cancelled = false;
    fetchUtilityInfrastructure(developmentId)
      .then((data) => {
        if (!cancelled) {
          setUtilitiesData(data);
        }
      })
      .catch((err) => {
        console.warn('Could not load utility infrastructure network:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [developmentId]);

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
  const attachTileLayer = (map: L.Map, theme: 'offline' | 'dark' | 'osm' | 'satellite') => {
    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
      currentTileLayerRef.current = null;
    }

    if (theme === 'offline') {
      const offlineLayer = createOfflineCanvasGrid();
      offlineLayer.addTo(map);
      currentTileLayerRef.current = offlineLayer;
    } else {
      let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      let maxZoom = 20;

      if (theme === 'osm') {
        tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      } else if (theme === 'satellite') {
        // ArcGIS World Imagery (Satellite)
        tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        maxZoom = 19;
      }

      const layer = L.tileLayer(tileUrl, {
        maxZoom,
        subdomains: theme === 'satellite' ? [] : 'abcd'
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

    if (utilityLayerRef.current) {
      utilityLayerRef.current.bringToFront();
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

        const utilGroup = L.featureGroup().addTo(map);
        utilityLayerRef.current = utilGroup;

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
      const colors = activeColorMode === 'infrastructure'
        ? getInfrastructureColors(stand.servicing, stand.land_constraint)
        : getStatusColors(stand.status);

      // GeoJSON Polygon coordinates are [lng, lat], Leaflet polygon needs [lat, lng]
      const leafletCoords = stand.geometry.coordinates[0].map(
        ([lng, lat]) => [lat, lng] as [number, number]
      );

      const polygon = L.polygon(leafletCoords, {
        color: isSelected ? '#38bdf8' : colors.stroke,
        weight: isSelected ? 3.5 : 2,
        fillColor: colors.fill,
        fillOpacity: isSelected ? 0.65 : colors.fillOpacity,
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
            stand.boundary_traverse && stand.boundary_traverse.length > 0 ? `
              <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 6px; font-size: 9px; color: #94a3b8; margin-bottom: 6px;">
                <div style="font-weight: bold; color: #38bdf8; margin-bottom: 3px; display: flex; justify-content: space-between;">
                  <span>📐 Surveyor-General Traverse Legs</span>
                  <span>${stand.boundary_traverse.length} legs</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                  <thead>
                    <tr style="color: #64748b; border-bottom: 1px solid #1e293b;">
                      <th style="padding: 1px;">Leg</th>
                      <th style="padding: 1px;">Bearing</th>
                      <th style="padding: 1px; text-align: right;">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${stand.boundary_traverse.map(leg => `
                      <tr style="border-bottom: 1px solid rgba(30, 41, 59, 0.5);">
                        <td style="padding: 1px; font-weight: bold; color: #e2e8f0;">${esc(leg.leg)}</td>
                        <td style="padding: 1px; color: #38bdf8;">${esc(leg.bearing_formatted)}</td>
                        <td style="padding: 1px; text-align: right; color: #e2e8f0;">${esc(leg.distance_meters)}m</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
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

  }, [stands, selectedStandId, onSelectStand, onReserveClick, activeColorMode]);

  // Render Utility Infrastructure Layers (Water, Sewer, Power, Connectors)
  useEffect(() => {
    const utilGroup = utilityLayerRef.current;
    if (!utilGroup) return;

    utilGroup.clearLayers();
    if (!utilitiesData || !utilitiesData.features) return;

    utilitiesData.features.forEach((feat) => {
      const type = feat.properties?.utility_type;
      if (!feat.geometry) return;

      // Filter by layer toggle
      if (type === 'WATER_MAIN' && !showWater) return;
      if (type === 'SEWER_TRUNK' && !showSewer) return;
      if (type === 'POWER_11KV' && !showPower) return;
      if (type === 'STAND_CONNECTOR' && !showConnectors) return;

      if (feat.geometry.type === 'LineString') {
        const coords = (feat.geometry.coordinates as [number, number][]).map(
          ([lng, lat]) => [lat, lng] as [number, number]
        );

        let color = '#38bdf8';
        let weight = 2.5;
        let dashArray: string | undefined = undefined;

        if (type === 'WATER_MAIN') {
          color = '#0284c7'; // Deep Sky Blue
          weight = 3.5;
        } else if (type === 'SEWER_TRUNK') {
          color = '#d97706'; // Amber / Brown
          weight = 3.5;
        } else if (type === 'POWER_11KV') {
          color = '#a855f7'; // Purple
          weight = 3;
          dashArray = '5, 4';
        } else if (type === 'STAND_CONNECTOR') {
          color = '#64748b'; // Slate connector
          weight = 1.2;
          dashArray = '2, 3';
        }

        const polyline = L.polyline(coords, {
          color,
          weight,
          dashArray,
          opacity: 0.85
        });

        // Popup with utility engineering specifications
        const p = feat.properties || {};
        const popupContent = `
          <div style="font-family: monospace; font-size: 11px; color: #f1f5f9; padding: 2px;">
            <div style="font-weight: bold; color: ${color}; margin-bottom: 4px;">
              ${esc(p.name || type)}
            </div>
            <div>Type: <strong>${esc(type)}</strong></div>
            <div>Status: <span style="color: #34d399;">${esc(p.status || 'OPERATIONAL')}</span></div>
            ${p.pipe_dia_mm ? `<div>Diameter: <strong>${esc(p.pipe_dia_mm)}mm (${esc(p.material || 'uPVC')})</strong></div>` : ''}
            ${p.pressure_bar ? `<div>Operating Pressure: <strong>${esc(p.pressure_bar)} bar</strong></div>` : ''}
            ${p.gradient_percent ? `<div>Gravity Gradient: <strong>${esc(p.gradient_percent)}%</strong></div>` : ''}
            ${p.voltage_kv ? `<div>Voltage: <strong>${esc(p.voltage_kv)} kV</strong> (Way-leave servitude)</div>` : ''}
          </div>
        `;
        polyline.bindPopup(popupContent, { className: 'zimbuild-custom-leaflet-popup' });
        utilGroup.addLayer(polyline);
      }
    });

    // Keep stand polygons and stand centroids on top of utility infrastructure
    if (geojsonLayerRef.current) {
      geojsonLayerRef.current.bringToFront();
    }
  }, [utilitiesData, showWater, showSewer, showPower, showConnectors]);

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
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg shadow-lg backdrop-blur transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg shadow-lg backdrop-blur transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleRecenter}
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg shadow-lg backdrop-blur transition"
          title="Reset View"
        >
          <Compass className="w-4 h-4" />
        </button>
        <button
          onClick={() => setMapTileTheme(prev => prev === 'offline' ? 'dark' : prev === 'dark' ? 'osm' : prev === 'osm' ? 'satellite' : 'offline')}
          className={`p-2 rounded-lg shadow-lg backdrop-blur border transition ${
            mapTileTheme === 'offline' 
              ? 'bg-emerald-950/90 text-emerald-400 border-emerald-600/80' 
              : mapTileTheme === 'satellite'
              ? 'bg-amber-950/90 text-amber-300 border-amber-600/80'
              : 'bg-slate-900/90 hover:bg-slate-800 text-indigo-400 border-slate-700/80'
          }`}
          title={`Active: ${mapTileTheme.toUpperCase()} (Click to toggle Offline/Dark/Street/Satellite)`}
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Infrastructure View Mode Switcher (Cadastre vs Civil Servicing) */}
        <button
          onClick={() => setActiveColorMode(prev => prev === 'cadastre' ? 'infrastructure' : 'cadastre')}
          className={`p-2 rounded-lg shadow-lg backdrop-blur border transition ${
            activeColorMode === 'infrastructure'
              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/80 ring-1 ring-cyan-500/50'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80'
          }`}
          title={`Mode: ${activeColorMode === 'infrastructure' ? 'Civil Servicing Stage (Click for Cadastre)' : 'Cadastre Status (Click for Civil Servicing)'}`}
        >
          <HardHat className="w-4 h-4" />
        </button>

        {/* Civil Reticulation & Utility Infrastructure Toggle */}
        <div className="relative">
          <button
            onClick={() => setIsUtilitiesMenuOpen(prev => !prev)}
            className={`p-2 rounded-lg shadow-lg backdrop-blur border transition ${
              isUtilitiesMenuOpen || (showWater || showSewer || showPower)
                ? 'bg-indigo-950/90 text-indigo-300 border-indigo-500/80'
                : 'bg-slate-900/90 hover:bg-slate-800 text-slate-400 border-slate-700/80'
            }`}
            title="Civil Utility Infrastructure Reticulation Layers"
          >
            <GitCommit className="w-4 h-4" />
          </button>

          {isUtilitiesMenuOpen && (
            <div className="absolute right-0 top-11 z-[450] bg-slate-950/95 border border-slate-700/90 rounded-xl p-3 shadow-2xl backdrop-blur-md w-60 text-xs font-mono space-y-2">
              <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span>Civil Reticulation</span>
                <span className="text-[10px] text-indigo-400">GIS Networks</span>
              </div>

              {/* Water Main Toggle */}
              <button
                type="button"
                onClick={() => setShowWater(v => !v)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-left transition ${
                  showWater 
                    ? 'bg-sky-950/50 border-sky-500/60 text-sky-200' 
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 line-through'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  <span>Water Main (160mm)</span>
                </div>
                {showWater ? <Eye className="w-3.5 h-3.5 text-sky-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>

              {/* Sewer Outfall Toggle */}
              <button
                type="button"
                onClick={() => setShowSewer(v => !v)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-left transition ${
                  showSewer 
                    ? 'bg-amber-950/50 border-amber-500/60 text-amber-200' 
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 line-through'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Sewer Trunk (200mm)</span>
                </div>
                {showSewer ? <Eye className="w-3.5 h-3.5 text-amber-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>

              {/* 11kV Power Feeder Toggle */}
              <button
                type="button"
                onClick={() => setShowPower(v => !v)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-left transition ${
                  showPower 
                    ? 'bg-purple-950/50 border-purple-500/60 text-purple-200' 
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 line-through'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>ZETDC 11kV Line</span>
                </div>
                {showPower ? <Eye className="w-3.5 h-3.5 text-purple-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>

              {/* Stand Service Connectors Toggle */}
              <button
                type="button"
                onClick={() => setShowConnectors(v => !v)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-left transition ${
                  showConnectors 
                    ? 'bg-slate-800/80 border-slate-600 text-slate-200' 
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 line-through'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-0.5 bg-slate-400" />
                  <span>Stand Service Ties</span>
                </div>
                {showConnectors ? <Eye className="w-3.5 h-3.5 text-slate-300" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Dynamic Legend */}
      <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-[400] bg-slate-950/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800/80 text-[10px] font-mono shadow-2xl flex flex-wrap items-center gap-3">
        {activeColorMode === 'cadastre' ? (
          <>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm" />
              <span className="text-slate-300 font-medium">Available</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shadow-sm" />
              <span className="text-slate-300 font-medium">Reserved</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shadow-sm" />
              <span className="text-slate-300 font-medium">Allocated</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-sm" />
              <span className="text-rose-300 font-medium">Protected (Wetland)</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 shadow-sm" />
              <span className="text-cyan-300 font-medium">Fully Serviced (3/3 Certified)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shadow-sm" />
              <span className="text-amber-300 font-medium">Works in Progress</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 shadow-sm" />
              <span className="text-slate-400 font-medium">Unserviced (Planned)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-sm" />
              <span className="text-rose-300 font-medium">Wetland / Exclusion</span>
            </div>
          </>
        )}

        {showWater && (
          <div className="flex items-center space-x-1.5 border-l border-slate-800 pl-2">
            <span className="w-3 h-0.5 bg-sky-500" />
            <span className="text-sky-300">Water Main</span>
          </div>
        )}
        {showSewer && (
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 bg-amber-500" />
            <span className="text-amber-300">Sewer Trunk</span>
          </div>
        )}
        {showPower && (
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-purple-400" />
            <span className="text-purple-300">11kV Corridor</span>
          </div>
        )}
      </div>

      {/* Offline Status & Gesture Tips */}
      <div className="absolute top-3 left-3 z-[400] flex items-center space-x-2">
        <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono flex items-center space-x-1.5 backdrop-blur shadow-md ${
          mapTileTheme === 'offline' || isOffline
            ? 'bg-slate-950/90 border-emerald-500/60 text-emerald-400'
            : mapTileTheme === 'satellite'
            ? 'bg-slate-950/90 border-amber-500/60 text-amber-300'
            : 'bg-slate-950/90 border-slate-700/80 text-indigo-300'
        }`}>
          <span className={`w-2 h-2 rounded-full ${mapTileTheme === 'offline' || isOffline ? 'bg-emerald-400' : 'bg-cyan-400 animate-pulse'}`} />
          <span>
            {mapTileTheme === 'offline' ? 'Offline GIS Engine' : mapTileTheme === 'dark' ? 'CartoDB Dark Tiles' : mapTileTheme === 'satellite' ? 'ArcGIS World Satellite' : 'OSM Street Tiles'} • {activeColorMode === 'infrastructure' ? 'Civil Servicing Lens' : 'Cadastre Lens'}
          </span>
        </div>
      </div>

    </div>
  );
};
