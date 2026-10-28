import React, { useState } from 'react';
import { Upload, X, CheckCircle2, FileText, AlertCircle, Terminal, HelpCircle } from 'lucide-react';
import { importStands, ApiError } from '../../api';

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
  const [activeTab, setActiveTab] = useState<'upload' | 'docs'>('upload');

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
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
          aria-label="Close modal"
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
            onClick={() => setActiveTab('docs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center space-x-1 transition ${
              activeTab === 'docs' 
                ? 'bg-indigo-600 text-white font-semibold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1" />
            <span>Developer Guide (Shapefile Conversion)</span>
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
