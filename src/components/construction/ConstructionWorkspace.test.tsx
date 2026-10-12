import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConstructionWorkspace } from './ConstructionWorkspace';
import * as api from '../../api';

// Mock the API module
vi.mock('../../api', () => ({
  fetchProjects: vi.fn(),
  fetchTenders: vi.fn(),
}));

describe('ConstructionWorkspace', () => {
  const notify = vi.fn();
  const fail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation to prevent errors in child components
    vi.mocked(api.fetchProjects).mockResolvedValue([]);
    vi.mocked(api.fetchTenders).mockResolvedValue([]); // Prevent warning in TendersPanel
  });

  it('renders sign-in message when no session is provided', async () => {
    await act(async () => {
      render(<ConstructionWorkspace session={null} notify={notify} fail={fail} />);
    });
    expect(screen.getByText(/Sign in with a construction role/i)).toBeInTheDocument();
  });

  it('renders no role message when session has no construction roles', async () => {
    const session = {
      token: 'dummy',
      sub: 'user1',
      roles: ['USER'],
      expiresAt: Date.now() + 10000,
    };
    await act(async () => {
      render(<ConstructionWorkspace session={session} notify={notify} fail={fail} />);
    });
    expect(screen.getByText(/Your sign-in has no construction role/i)).toBeInTheDocument();
  });

  it('renders subcontractor portal when session has SUBCONTRACTOR role', async () => {
    const session = {
      token: 'dummy',
      sub: 'user1',
      roles: ['SUBCONTRACTOR'],
      expiresAt: Date.now() + 10000,
    };
    await act(async () => {
      render(<ConstructionWorkspace session={session} notify={notify} fail={fail} />);
    });
    expect(screen.getByText(/Subcontractor portal/i)).toBeInTheDocument();
    expect(screen.getByText(/Bid on open tenders/i)).toBeInTheDocument();
  });

  it('renders staff workspace when session has a staff role', async () => {
    const session = {
      token: 'dummy',
      sub: 'user1',
      roles: ['PROJECT_MANAGER'],
      expiresAt: Date.now() + 10000,
    };
    await act(async () => {
      render(<ConstructionWorkspace session={session} notify={notify} fail={fail} />);
    });
    // "Projects, job costing..." is the subtitle of the Header in StaffWorkspace
    expect(await screen.findByText(/Projects, job costing, site progress, tenders, quality and plant/i)).toBeInTheDocument();
  });
});
