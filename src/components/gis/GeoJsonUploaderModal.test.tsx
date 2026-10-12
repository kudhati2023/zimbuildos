import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import { GeoJsonUploaderModal } from './GeoJsonUploaderModal';
import { importStands, ApiError } from '../../api';

// Mock the API module
vi.mock('../../api', () => {
  return {
    importStands: vi.fn(),
    ApiError: class ApiError extends Error {
      details: any;
      constructor(public status: number, public code: string, message: string, details?: any) {
        super(message);
        this.details = details;
        this.name = 'ApiError';
      }
    }
  };
});

describe('GeoJsonUploaderModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUploadSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when not open', () => {
    render(
      <GeoJsonUploaderModal
        isOpen={false}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );
    expect(screen.queryByText('Upload Spatial Cadastre Layer')).not.toBeInTheDocument();
  });

  it('renders correctly when open', () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );
    expect(screen.getByText('Upload Spatial Cadastre Layer')).toBeInTheDocument();
    expect(screen.getByText(/test-dev-id/)).toBeInTheDocument();
  });

  it('closes the modal after clicking close button', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );
    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[0]);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes the modal after clicking cancel button', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('switches between upload and docs tab', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );
    const docsTab = screen.getByText(/Developer Guide/i);
    fireEvent.click(docsTab);
    expect(screen.getByText(/Converting ESRI Shapefiles/i)).toBeInTheDocument();
    expect(screen.queryByText('Ingest Spatial Layer')).not.toBeInTheDocument();

    const uploadTab = screen.getByText('Import GeoJSON');
    fireEvent.click(uploadTab);
    expect(screen.queryByText(/Converting ESRI Shapefiles/i)).not.toBeInTheDocument();
    expect(screen.getByText('Ingest Spatial Layer')).toBeInTheDocument();
  });

  it('shows an error if the pasted text is not valid JSON', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );

    const textarea = screen.getByPlaceholderText(/type": "FeatureCollection"/);
    fireEvent.change(textarea, { target: { value: 'invalid json' } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    fireEvent.click(submitBtn);

    expect(screen.getByText((content) => content.includes('is not valid JSON') || content.includes('Failed to process GeoJSON'))).toBeInTheDocument();
  });

  it('shows an error if the JSON is valid but not a FeatureCollection', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );

    const textarea = screen.getByPlaceholderText(/type": "FeatureCollection"/);
    const invalidFormatJson = JSON.stringify({ type: "Polygon", coordinates: [] });
    fireEvent.change(textarea, { target: { value: invalidFormatJson } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Root object must be a GeoJSON FeatureCollection/i)).toBeInTheDocument();
  });

  it('successfully parses and submits valid GeoJSON', async () => {
    vi.mocked(importStands).mockResolvedValue({ importedCount: 2 });
    vi.useFakeTimers();

    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );

    const textarea = screen.getByPlaceholderText(/type": "FeatureCollection"/);
    const validJson = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }] });
    fireEvent.change(textarea, { target: { value: validJson } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');

    await act(async () => {
        fireEvent.click(submitBtn);
    });

    expect(importStands).toHaveBeenCalledWith('test-dev-id', JSON.parse(validJson));

    expect(screen.getByText(/Imported 2 surveyed stand\(s\) into the cadastre\./i)).toBeInTheDocument();

    expect(mockOnUploadSuccess).toHaveBeenCalledWith(2);

    act(() => {
        vi.advanceTimersByTime(1500);
    });
    expect(mockOnClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('displays api error correctly', async () => {
    const apiError = new ApiError(400, 'BAD_REQUEST', 'Import failed', [
      { feature: 1, stand_number: 'STAND1', errors: ['Missing price'] },
      { feature: 2, stand_number: null, errors: ['Invalid geometry', 'Out of bounds'] }
    ]);
    vi.mocked(importStands).mockRejectedValue(apiError);

    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );

    const textarea = screen.getByPlaceholderText(/type": "FeatureCollection"/);
    const validJson = JSON.stringify({ type: "FeatureCollection", features: [] });
    fireEvent.change(textarea, { target: { value: validJson } });

    const submitBtn = screen.getByText('Ingest Spatial Layer');

    await act(async () => {
        fireEvent.click(submitBtn);
    });

    expect(screen.getByText((content) => content.includes('Import failed'))).toBeInTheDocument();

    expect(screen.getByText((content) => content.includes('#1 (STAND1): Missing price') && content.includes('#2: Invalid geometry; Out of bounds'))).toBeInTheDocument();
  });

  it('handles file upload correctly (valid)', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );

    const validJson = JSON.stringify({ type: "FeatureCollection", features: [] });
    const file = new File([validJson], 'test.geojson', { type: 'application/json' });

    const input = document.getElementById('geojson-file-input') as HTMLInputElement;

    const mockFileReader = {
      // @ts-ignore
      readAsText: vi.fn(function(this: any, _file: File) {
          if (this.onload) {
              this.onload({ target: { result: validJson } });
          }
      }),
    };

    vi.spyOn(window, 'FileReader').mockImplementation(() => mockFileReader as any);

    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [file]
      });
      fireEvent.change(input);
    });

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/type": "FeatureCollection"/) as HTMLTextAreaElement;
      expect(textarea.value).toBe(validJson);
    });
  });

  it('handles file upload correctly (invalid JSON)', async () => {
    render(
      <GeoJsonUploaderModal
        isOpen={true}
        onClose={mockOnClose}
        onUploadSuccess={mockOnUploadSuccess}
        developmentId="test-dev-id"
      />
    );

    const invalidJson = 'invalid json data';
    const file = new File([invalidJson], 'test.geojson', { type: 'application/json' });

    const input = document.getElementById('geojson-file-input') as HTMLInputElement;

    const mockFileReader = {
      // @ts-ignore
      readAsText: vi.fn(function(this: any, _file: File) {
          if (this.onload) {
              this.onload({ target: { result: invalidJson } });
          }
      }),
    };

    vi.spyOn(window, 'FileReader').mockImplementation(() => mockFileReader as any);

    await act(async () => {
      Object.defineProperty(input, 'files', {
        value: [file]
      });
      fireEvent.change(input);
    });

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON file format. Please check the file contents.')).toBeInTheDocument();
    });
  });
});
