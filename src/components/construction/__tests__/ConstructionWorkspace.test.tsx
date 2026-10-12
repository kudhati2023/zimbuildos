import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConstructionWorkspace } from '../ConstructionWorkspace';
import * as api from '../../../api';
import { Session, ConstructionProject } from '../../../types';

// Mock the API module
vi.mock('../../../api', () => ({
  fetchProjects: vi.fn(),
  createProject: vi.fn(),
  setProjectStatus: vi.fn(),
}));

// Mock child components that we don't need to test in detail here
vi.mock('../JobCostingPanel', () => ({
  JobCostingPanel: () => <div data-testid="job-costing-panel">JobCostingPanel</div>
}));
vi.mock('../SiteProgressPanel', () => ({
  SiteProgressPanel: () => <div data-testid="site-progress-panel">SiteProgressPanel</div>
}));
vi.mock('../TendersPanel', () => ({
  TendersPanel: () => <div data-testid="tenders-panel">TendersPanel</div>
}));
vi.mock('../QualityPanel', () => ({
  QualityPanel: () => <div data-testid="quality-panel">QualityPanel</div>
}));
vi.mock('../PlantPanel', () => ({
  PlantPanel: () => <div data-testid="plant-panel">PlantPanel</div>
}));

describe('ConstructionWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNotify = vi.fn();
  const mockFail = vi.fn();

  const createMockSession = (roles: string[]): Session => ({
    sub: 'user1',
    roles,
    token: 'fake-token',
    expiresAt: Date.now(), // It is a number
  });

  const createMockProject = (overrides: Partial<ConstructionProject>): ConstructionProject => ({
    project_id: 'proj-1',
    code: 'PROJ-01',
    name: 'Test Project 1',
    status: 'ACTIVE',
    budget_usd: '10000',
    actual_usd: '5000',
    percent_complete: 50,
    open_ncrs: 0,
    claims_awaiting_certification: 0,
    site_location: 'Location 1',
    client_name: 'Client 1',
    start_date: '2023-01-01',
    planned_end_date: '2023-12-31',
    contract_value_usd: '10000',
    development_id: null,
    created_by: 'user1',
    created_at: new Date().toISOString(),
    ...overrides,
  });

  it('renders "Sign in with a construction role" when no session is provided', () => {
    render(<ConstructionWorkspace session={null} notify={mockNotify} fail={mockFail} />);
    expect(screen.getByText(/Sign in with a construction role/i)).toBeInTheDocument();
  });

  it('renders "Your sign-in has no construction role" for non-construction roles', () => {
    const session = createMockSession(['SOME_OTHER_ROLE']);
    render(<ConstructionWorkspace session={session} notify={mockNotify} fail={mockFail} />);
    expect(screen.getByText(/Your sign-in has no construction role/i)).toBeInTheDocument();
  });

  it('renders Subcontractor portal for SUBCONTRACTOR role', () => {
    const session = createMockSession(['SUBCONTRACTOR']);
    render(<ConstructionWorkspace session={session} notify={mockNotify} fail={mockFail} />);
    expect(screen.getByText(/Subcontractor portal/i)).toBeInTheDocument();
    expect(screen.getByTestId('tenders-panel')).toBeInTheDocument();
  });

  it('renders StaffWorkspace for construction roles (e.g. PROJECT_MANAGER)', async () => {
    const session = createMockSession(['PROJECT_MANAGER']);

    // Mock fetchProjects to return an empty array
    vi.mocked(api.fetchProjects).mockResolvedValueOnce([]);

    render(<ConstructionWorkspace session={session} notify={mockNotify} fail={mockFail} />);

    // Check if the StaffWorkspace is rendered by looking for its Header title
    expect(await screen.findByText(/Projects, job costing, site progress, tenders, quality and plant/i)).toBeInTheDocument();
    expect(screen.getByText(/No construction projects yet/i)).toBeInTheDocument();
    expect(screen.getByText(/\+ New project/i)).toBeInTheDocument();
  });

  it('renders project list when projects are fetched', async () => {
    const session = createMockSession(['PROJECT_MANAGER']);
    const mockProjects = [
      createMockProject({
        code: 'PROJ-01',
        name: 'Test Project 1',
        open_ncrs: 1,
      })
    ];

    vi.mocked(api.fetchProjects).mockResolvedValueOnce(mockProjects);

    await act(async () => {
      render(<ConstructionWorkspace session={session} notify={mockNotify} fail={mockFail} />);
    });

    // Wait for the project to be displayed
    expect(await screen.findByText('PROJ-01')).toBeInTheDocument();
    expect(screen.getByText('Test Project 1')).toBeInTheDocument();

    // Check if the first project is automatically selected
    expect(screen.getByText(/PROJ-01 — Test Project 1/i)).toBeInTheDocument();

    // Check if JobCostingPanel is rendered by default (module === 'COSTS')
    expect(screen.getByTestId('job-costing-panel')).toBeInTheDocument();
  });

  it('allows switching between modules', async () => {
    const session = createMockSession(['PROJECT_MANAGER']);
    const mockProjects = [createMockProject({})];

    vi.mocked(api.fetchProjects).mockResolvedValueOnce(mockProjects);

    await act(async () => {
      render(<ConstructionWorkspace session={session} notify={mockNotify} fail={mockFail} />);
    });

    // Check if JobCostingPanel is rendered by default
    expect(await screen.findByTestId('job-costing-panel')).toBeInTheDocument();

    // Click on 'Site Progress' module
    fireEvent.click(screen.getByText('Site Progress'));
    expect(screen.getByTestId('site-progress-panel')).toBeInTheDocument();

    // Click on 'Quality Control' module
    fireEvent.click(screen.getByText('Quality Control'));
    expect(screen.getByTestId('quality-panel')).toBeInTheDocument();
  });

  it('toggles new project form for PROJECT_MANAGER', async () => {
    const session = createMockSession(['PROJECT_MANAGER']);
    vi.mocked(api.fetchProjects).mockResolvedValueOnce([]);

    await act(async () => {
      render(<ConstructionWorkspace session={session} notify={mockNotify} fail={mockFail} />);
    });

    // New Project button should be visible
    const newProjectBtn = await screen.findByText('+ New project');
    expect(newProjectBtn).toBeInTheDocument();

    // Click it to open the form
    fireEvent.click(newProjectBtn);

    // Check if the form is rendered
    expect(screen.getByText('New construction project')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();

    // Check if the button changed to "Close"
    const closeBtn = screen.getByText('Close');
    expect(closeBtn).toBeInTheDocument();

    // Click "Close" to hide the form
    fireEvent.click(closeBtn);
    expect(screen.queryByText('New construction project')).not.toBeInTheDocument();
  });
});
