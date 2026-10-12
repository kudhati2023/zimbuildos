import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { GeoJsonUploaderModal } from '../GeoJsonUploaderModal';
import * as api from '../../../api';

// Mock the lucide-react icons since we just need them to render without errors
vi.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Upload: () => <div data-testid="icon-upload" />,
  HelpCircle: () => <div data-testid="icon-help" />,
  FileText: () => <div data-testid="icon-file" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
  CheckCircle2: () => <div data-testid="icon-check" />,
  Terminal: () => <div data-testid="icon-terminal" />,
}));

// Mock the api module completely to allow class manipulation
vi.mock('../../../api', () => ({
  importStands: vi.fn(),
  ApiError: class ApiError extends Error {
    details: any;
    constructor(message: string, details?: any) {
      super(message);
      this.name = 'ApiError';
      this.details = details;
    }
  }
}));

describe('GeoJsonUploaderModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUploadSuccess = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onUploadSuccess: mockOnUploadSuccess,
    developmentId: 'DEV-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<GeoJsonUploaderModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);
    expect(screen.getByText('Upload Spatial Cadastre Layer')).toBeInTheDocument();
    expect(screen.getByText(/Ingest GeoJSON \/ Shapefile cadastre plots into PostGIS/)).toBeInTheDocument();
    // Use regex for the specific string match since it contains multiple parts
    expect(screen.getByText(/DEV-123/)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);
    // The X icon button is the first button in the component
    const closeButtons = screen.getAllByRole('button');
    // It has absolute top-5 right-5
    const closeIconBtn = closeButtons.find(btn => btn.className.includes('absolute'));
    if (closeIconBtn) {
        fireEvent.click(closeIconBtn);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    } else {
        // Fallback to Cancel button
        fireEvent.click(screen.getByText('Cancel'));
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    }
  });

  it('allows pasting raw GeoJSON', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    const validJson = '{ "type": "FeatureCollection", "features": [] }';

    // Using fireEvent.change instead of userEvent.type for large text or strings with special chars
    fireEvent.change(textarea, { target: { value: validJson } });

    expect(textarea).toHaveValue(validJson);

    // The submit button should be enabled since we typed text
    const submitBtn = screen.getByText('Ingest Spatial Layer');
    expect(submitBtn).not.toBeDisabled();
  });

  it('handles invalid JSON gracefully on form submit', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'invalid json' } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    fireEvent.click(submitBtn);

    // It should display the JSON.parse error directly or a generic error
    await waitFor(() => {
      expect(screen.getByTestId('icon-alert')).toBeInTheDocument();
      expect(screen.getByText(/Failed to process GeoJSON|Unexpected token/)).toBeInTheDocument();
    });
  });

  it('handles missing FeatureCollection type on form submit', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '{ "type": "Polygon", "coordinates": [] }' } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Root object must be a GeoJSON FeatureCollection/i)).toBeInTheDocument();
    });
  });

  it('successfully uploads valid GeoJSON and calls onUploadSuccess', async () => {
    const mockImportStands = vi.mocked(api.importStands).mockResolvedValue({ importedCount: 2 });

    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    const validGeoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: {} },
        { type: 'Feature', properties: {}, geometry: {} }
      ]
    });

    fireEvent.change(textarea, { target: { value: validGeoJson } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockImportStands).toHaveBeenCalledWith('DEV-123', JSON.parse(validGeoJson));
      expect(screen.getByText('Imported 2 surveyed stand(s) into the cadastre.')).toBeInTheDocument();
      expect(mockOnUploadSuccess).toHaveBeenCalledWith(2);
    });
  });

  it('displays ApiError details when upload fails', async () => {
    const { ApiError } = api;

    vi.mocked(api.importStands).mockRejectedValue(
      new ApiError('Validation failed', [
        { feature: 1, stand_number: 'ST-01', errors: ['Invalid geometry', 'Missing price'] }
      ])
    );

    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByRole('textbox');
    const validGeoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: {} }]
    });

    fireEvent.change(textarea, { target: { value: validGeoJson } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Check for the error message using regex to match line breaks and complex text
      expect(screen.getByText(/Validation failed/)).toBeInTheDocument();
      expect(screen.getByText(/#1 \(ST-01\): Invalid geometry; Missing price/)).toBeInTheDocument();
    });
  });

  it('switches between tabs', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    // Verify we start on the upload tab
    expect(screen.getByText('OR PASTE RAW GEOJSON TEXT')).toBeInTheDocument();

    // Switch to docs tab
    const docsTab = screen.getByText(/Developer Guide/i);
    fireEvent.click(docsTab);

    // Verify upload content is gone and docs content is visible
    expect(screen.queryByText('OR PASTE RAW GEOJSON TEXT')).not.toBeInTheDocument();
    expect(screen.getByText('Converting ESRI Shapefiles (.shp) to GeoJSON')).toBeInTheDocument();

    // Switch back to upload tab
    const uploadTab = screen.getByText('Import GeoJSON');
    fireEvent.click(uploadTab);

    // Verify we're back on upload tab
    expect(screen.getByText('OR PASTE RAW GEOJSON TEXT')).toBeInTheDocument();
  });

  it('handles file upload selection', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const fileContent = '{ "type": "FeatureCollection", "features": [] }';
    const file = new File([fileContent], 'test.geojson', { type: 'application/geo+json' });

    const fileInput = screen.getByLabelText(/Click to select GeoJSON file/i);

    // We can use fireEvent to simulate file selection
    fireEvent.change(fileInput, { target: { files: [file] } });

    // The reader runs asynchronously, so we wait for the textarea to be populated
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(fileContent);
    });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    expect(submitBtn).not.toBeDisabled();
  });

  it('handles invalid file upload selection gracefully', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const fileContent = 'invalid json data';
    const file = new File([fileContent], 'test.geojson', { type: 'application/geo+json' });

    const fileInput = screen.getByLabelText(/Click to select GeoJSON file/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON file format/i)).toBeInTheDocument();
    });
  });
});
