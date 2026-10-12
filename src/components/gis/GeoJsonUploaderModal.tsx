import React, { useState } from 'react';
import { Upload, X, CheckCircle2, FileText, AlertCircle, Terminal, HelpCircle, Compass, Calculator } from 'lucide-react';
import { importStands, parseSGSchedule, ApiError } from '../../api';
import type { SGScheduleParseResult } from '../../types';

interface GeoJsonUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (importedCount: number) => void;
  developmentId: string;
}

export const GeoJsonUploaderModal: React.FC<GeoJsonUploaderModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  developmentId
}) => {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'sg' | 'docs'>('upload');

  // Surveyor-General Schedule Parsing State
  const [sgText, setSgText] = useState(
`A   +294500.00   -1979200.00
B   +294540.00   -1979200.00
C   +294540.00   -1979250.00
D   +294500.00   -1979250.00`
  );
  const [sgStandNumber, setSgStandNumber] = useState('BUD2-601');
  const [sgPriceUsd, setSgPriceUsd] = useState('1500.00');
  const [sgResult, setSgResult] = useState<SGScheduleParseResult | null>(null);
  const [isParsingSG, setIsParsingSG] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        JSON.parse(content); // Validate JSON format
        setJsonText(content);
        setError(null);
      } catch (err: unknown) {
        setError('Invalid JSON file format. Please check the file contents.');
      }
    };
    reader.readAsText(file);
  };

  const handleSGFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSgText(content);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleParseSG = async () => {
    setError(null);
    setSuccessMsg(null);
    setIsParsingSG(true);
    try {
      const res = await parseSGSchedule(sgText, {
        centralMeridian: 31,
        originLat: -17.8292
      });
      setSgResult(res);
      setSuccessMsg(`Parsed ${res.beacons.length} beacons, ${res.traverse.length} traverse legs. Area: ${res.shape.areaSqm} m²`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse Surveyor-General coordinate schedule.');
    } finally {
      setIsParsingSG(false);
    }
  };

  const handleImportSGCadastre = async () => {
    if (!sgResult) return;
    setError(null);
    setSuccessMsg(null);
    setIsUploading(true);

    try {
      const feature = {
        type: 'Feature' as const,
        geometry: sgResult.geometry,
        properties: {
          stand_number: sgStandNumber.trim(),
          price_usd: sgPriceUsd.trim(),
          area_sqm: sgResult.shape.areaSqm,
          zoning_type: 'SINGLE_RESIDENTIAL',
          quota_category: 'GENERAL',
          surveyor_general_ref: `SG/CAD/${sgStandNumber.trim()}`
        }
      };

      const fc = {
        type: 'FeatureCollection' as const,
        features: [feature]
      };

      const { importedCount } = await importStands(developmentId, fc);
      setSuccessMsg(`Imported stand ${sgStandNumber} with SG traverse verification.`);
      onUploadSuccess(importedCount);
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import stand.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
        throw new Error('Root object must be a GeoJSON FeatureCollection with an array of features.');
      }

      setIsUploading(true);
      const { importedCount } = await importStands(developmentId, parsed);
      setIsUploading(false);
      setSuccessMsg(`Imported ${importedCount} surveyed stand(s) into the cadastre.`);
      onUploadSuccess(importedCount);
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      setIsUploading(false);
      // The server rejects the whole file if any feature is invalid and lists every problem.
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const lines = (err.details as { feature: number; stand_number: string | null; errors: string[] }[])
          .slice(0, 20)
          .map((p) => `#${p.feature}${p.stand_number ? ` (${p.stand_number})` : ''}: ${p.errors.join('; ')}`);
        setError(`${err.message}\n${lines.join('\n')}`);
      } else {
        setError((err as Error).message || 'Failed to process GeoJSON');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150">
        
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 bg-indigo-950/90 border border-indigo-500/40 rounded-xl text-indigo-400">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-100">Upload Spatial Cadastre Layer</h3>
            <p className="text-xs text-slate-400">Ingest GeoJSON / Shapefile cadastre plots into PostGIS ({developmentId})</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex space-x-2 border-b border-slate-800 pb-2 mb-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
              activeTab === 'upload' 
                ? 'bg-indigo-600 text-white font-semibold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Import GeoJSON
          </button>
          <button
            onClick={() => setActiveTab('sg')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center space-x-1 transition ${
              activeTab === 'sg' 
                ? 'bg-indigo-600 text-white font-semibold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5 mr-1 text-sky-400" />
            <span>Surveyor-General (.CRD)</span>
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center space-x-1 transition ${
              activeTab === 'docs' 
                ? 'bg-indigo-600 text-white font-semibold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1" />
            <span>Developer Guide</span>
          </button>
        </div>

        {activeTab === 'upload' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-5 text-center cursor-pointer bg-slate-950/40">
              <input 
                type="file" 
                accept=".geojson,.json"
                onChange={handleFileUpload}
                className="hidden" 
                id="geojson-file-input" 
              />
              <label htmlFor="geojson-file-input" className="cursor-pointer block">
                <FileText className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <span className="text-xs text-slate-300 font-medium block">
                  Click to select GeoJSON file from your computer
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                  Standard WGS84 (EPSG:4326) coordinate reference system
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">
                OR PASTE RAW GEOJSON TEXT
              </label>
              <textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                placeholder='{ "type": "FeatureCollection", "features": [ ... ] }'
                rows={6}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start space-x-2 max-h-40 overflow-y-auto">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="whitespace-pre-line">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!jsonText.trim() || isUploading}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-950"
              >
                {isUploading ? 'Validating Cadastre...' : 'Ingest Spatial Layer'}
              </button>
            </div>
          </form>
        ) : activeTab === 'sg' ? (
          <div className="space-y-4">
            <div className="bg-sky-950/40 border border-sky-500/30 p-3 rounded-xl text-xs text-sky-200 flex items-start space-x-2">
              <Compass className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-100">Surveyor-General Gauss Conform Lo Coordinate Schedule</p>
                <p className="text-[11px] text-sky-300/80 mt-0.5">
                  Paste lettered beacon coordinates (e.g. <code>A +294500.00 -1979200.00</code>) or upload a <code>.crd/.txt</code> schedule file. The system will compute azimuth bearings, traverse legs, polygon area, and project into WGS84.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Stand Number</label>
                <input
                  type="text"
                  value={sgStandNumber}
                  onChange={e => setSgStandNumber(e.target.value)}
                  placeholder="e.g. BUD2-601"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-white focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Price (USD)</label>
                <input
                  type="text"
                  value={sgPriceUsd}
                  onChange={e => setSgPriceUsd(e.target.value)}
                  placeholder="e.g. 1500.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-white focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-mono text-slate-300">
                  BEACON COORDINATES SCHEDULE (Beacon X_East Y_North)
                </label>
                <label className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer font-mono">
                  <span>Upload .crd/.txt</span>
                  <input
                    type="file"
                    accept=".crd,.txt,.dat"
                    onChange={handleSGFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                value={sgText}
                onChange={e => setSgText(e.target.value)}
                placeholder="A  +294500.00  -1979200.00&#10;B  +294540.00  -1979200.00&#10;C  +294540.00  -1979250.00&#10;D  +294500.00  -1979250.00"
                rows={5}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={handleParseSG}
                disabled={!sgText.trim() || isParsingSG}
                className="flex-1 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-1.5"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>{isParsingSG ? 'Parsing Geodesy...' : 'Compute Bearings & Area'}</span>
              </button>
            </div>

            {/* Parsed Result Preview */}
            {sgResult && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono space-y-2 max-h-44 overflow-y-auto">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                  <span className="text-emerald-400 font-bold">Area: {sgResult.shape.areaSqm} m²</span>
                  <span className="text-slate-400">{sgResult.traverse.length} Traverse Legs</span>
                </div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th>Leg</th>
                      <th>Bearing (deg min)</th>
                      <th className="text-right">Distance (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sgResult.traverse.map(leg => (
                      <tr key={leg.leg} className="border-b border-slate-900">
                        <td className="text-slate-200 font-bold">{leg.leg}</td>
                        <td className="text-sky-400">{leg.bearing_formatted}</td>
                        <td className="text-right text-slate-300">{leg.distance_meters}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSGCadastre}
                disabled={!sgResult || isUploading || !sgStandNumber.trim()}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-950"
              >
                {isUploading ? 'Registering Cadastre Stand...' : 'Ingest Stand with SG Traverse'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 font-mono text-xs max-h-[360px] overflow-y-auto pr-1">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <span className="text-indigo-400 font-bold block mb-1 flex items-center">
                <Terminal className="w-3.5 h-3.5 mr-1" /> Converting ESRI Shapefiles (.shp) to GeoJSON
              </span>
              <p className="text-[11px] text-slate-400 mb-2">
                Use GDAL's <code>ogr2ogr</code> utility to transform surveyor CAD/Shapefile datasets from Arc 1950 UTM Zone 36S (EPSG:20936) to WGS84 (EPSG:4326):
              </p>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-emerald-400 select-all overflow-x-auto text-[11px]">
                ogr2ogr -f GeoJSON -s_srs EPSG:20936 -t_srs EPSG:4326 budiriro_stands.geojson surveyor_boundary.shp
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <span className="text-cyan-400 font-bold block mb-1">
                Required GeoJSON Feature Properties
              </span>
              <p className="text-[11px] text-slate-400 mb-2">
                Each feature within the <code>FeatureCollection</code> should include these properties:
              </p>
              <pre className="bg-slate-900 p-2.5 rounded-lg text-slate-300 text-[10px] overflow-x-auto">
{`{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[lng, lat], ..., [lng, lat]]] },
  "properties": {
    "stand_number": "BUD2-501",            // required, unique
    "price_usd": "1400.00",                // required unless land_constraint is set
    "area_sqm": 350,                       // optional: computed from the polygon
    "zoning_type": "SINGLE_RESIDENTIAL",   // | HIGH_RISE_FLAT | COMMERCIAL | MSME_WORKSPACE
    "quota_category": "YOUTH",             // | GENERAL | WOMEN | DISABILITY | VETERAN | PUBLIC_SERVANT
    "land_constraint": null,               // | WETLAND | POWER_WAYLEAVE | ROAD_SERVITUDE | FLOOD_ZONE
    "surveyor_general_ref": "SG/HRE/2026/0501"
  }
}`}
              </pre>
              <p className="text-[11px] text-slate-400 mt-2">
                Stands always start AVAILABLE (or protected, if a land constraint is given); servicing is certified
                afterwards by the civil engineering unit. If any feature is invalid, nothing is imported and every
                problem is listed.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
