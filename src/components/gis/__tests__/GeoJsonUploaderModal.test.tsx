import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoJsonUploaderModal } from '../GeoJsonUploaderModal';
import { importStands, ApiError } from '../../../api';
import { vi } from 'vitest';

// Mock the API call
vi.mock('../../../api', () => ({
  importStands: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public details?: any) {
      super(message);
      this.name = 'ApiError';
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
    developmentId: 'DEV123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(<GeoJsonUploaderModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText(/Upload Spatial Cadastre Layer/i)).not.toBeInTheDocument();
  });

  it('renders correctly when isOpen is true', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);
    expect(screen.getByText(/Upload Spatial Cadastre Layer/i)).toBeInTheDocument();
    expect(screen.getByText(/Import GeoJSON/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);
    const closeButtons = screen.getAllByRole('button');
    // First button is the top right X, last button is the Cancel button
    fireEvent.click(closeButtons[0]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('switches between upload and docs tabs', () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    // Initially on upload tab
    expect(screen.getByPlaceholderText(/{ "type": "FeatureCollection"/)).toBeInTheDocument();

    // Switch to docs tab
    fireEvent.click(screen.getByText(/Developer Guide/i));
    expect(screen.getByText(/Converting ESRI Shapefiles/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/{ "type": "FeatureCollection"/)).not.toBeInTheDocument();

    // Switch back
    fireEvent.click(screen.getByText(/Import GeoJSON/i));
    expect(screen.getByPlaceholderText(/{ "type": "FeatureCollection"/)).toBeInTheDocument();
  });

  it('handles valid JSON text input and successful submit', async () => {
    vi.mocked(importStands).mockResolvedValueOnce({ importedCount: 2 });

    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/{ "type": "FeatureCollection"/);
    const validJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { stand_number: '1' }, geometry: null },
        { type: 'Feature', properties: { stand_number: '2' }, geometry: null }
      ]
    });

    fireEvent.change(textarea, { target: { value: validJson } });

    const submitBtn = screen.getByRole('button', { name: /Ingest Spatial Layer/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(screen.getByRole('button', { name: /Validating Cadastre/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(importStands).toHaveBeenCalledWith('DEV123', JSON.parse(validJson));
      expect(screen.getByText(/Imported 2 surveyed stand\(s\)/i)).toBeInTheDocument();
      expect(mockOnUploadSuccess).toHaveBeenCalledWith(2);
    });

    // Check if onClose was called after the timeout (mocked)
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('shows error when submitting invalid GeoJSON format (not FeatureCollection)', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/{ "type": "FeatureCollection"/);
    const invalidFormatJson = JSON.stringify({
      type: 'NotFeatureCollection',
      features: []
    });

    fireEvent.change(textarea, { target: { value: invalidFormatJson } });
    fireEvent.click(screen.getByRole('button', { name: /Ingest Spatial Layer/i }));

    expect(screen.getByText(/Root object must be a GeoJSON FeatureCollection/i)).toBeInTheDocument();
    expect(importStands).not.toHaveBeenCalled();
  });

  it('shows error when submit fails with ApiError with details', async () => {
    const errorDetails = [
      { feature: 1, stand_number: '100', errors: ['Invalid geometry'] },
      { feature: 2, stand_number: null, errors: ['Missing stand number'] }
    ];
    const apiError = new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', errorDetails);

    vi.mocked(importStands).mockRejectedValueOnce(apiError);

    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/{ "type": "FeatureCollection"/);
    fireEvent.change(textarea, { target: { value: JSON.stringify({ type: 'FeatureCollection', features: [] }) } });

    fireEvent.click(screen.getByRole('button', { name: /Ingest Spatial Layer/i }));

    await waitFor(() => {
      expect(screen.getByText(/Validation failed/i)).toBeInTheDocument();
      expect(screen.getByText(/#1 \(100\): Invalid geometry/i)).toBeInTheDocument();
      expect(screen.getByText(/#2: Missing stand number/i)).toBeInTheDocument();
    });
  });

  it('shows error when submit fails with generic error', async () => {
    const errorMessage = 'Network error occurred';
    vi.mocked(importStands).mockRejectedValueOnce(new Error(errorMessage));

    render(<GeoJsonUploaderModal {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/{ "type": "FeatureCollection"/);
    fireEvent.change(textarea, { target: { value: JSON.stringify({ type: 'FeatureCollection', features: [] }) } });

    fireEvent.click(screen.getByRole('button', { name: /Ingest Spatial Layer/i }));

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('handles file upload with valid JSON', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const validJson = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const file = new File([validJson], 'stands.geojson', { type: 'application/json' });

    const input = document.getElementById('geojson-file-input') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/{ "type": "FeatureCollection"/) as HTMLTextAreaElement;
      expect(textarea.value).toBe(validJson);
      expect(screen.queryByText(/Invalid JSON file format/i)).not.toBeInTheDocument();
    });
  });

  it('handles file upload with invalid JSON', async () => {
    render(<GeoJsonUploaderModal {...defaultProps} />);

    const file = new File(['invalid json data'], 'stands.geojson', { type: 'application/json' });

    const input = document.getElementById('geojson-file-input') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON file format/i)).toBeInTheDocument();
    });
  });
});
