import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { ConstructionWorkspace } from '../../../src/components/construction/ConstructionWorkspace';
import * as api from '../../../src/api';
import type { Session, ConstructionProject } from '../../../src/types';

vi.mock('../../../src/api', () => ({
  fetchProjects: vi.fn(),
  fetchTenders: vi.fn(),
  fetchSubcontracts: vi.fn(),
  fetchJobCostingSummary: vi.fn(),
  fetchEquipment: vi.fn(),
  fetchQualitySummary: vi.fn(),
  fetchInspections: vi.fn(),
  fetchNcrs: vi.fn(),
  fetchDailyLogs: vi.fn(),
  fetchDailyReports: vi.fn(),
  fetchSiteReports: vi.fn(),
  createProject: vi.fn(),
  setProjectStatus: vi.fn(),
}));

const mockProjects: ConstructionProject[] = [
  {
    project_id: 'p-1',
    code: 'PROJ-1',
    name: 'Test Project 1',
    development_id: null,
    site_location: 'Site A',
    client_name: 'Client X',
    contract_value_usd: '1000000',
    start_date: '2024-01-01',
    planned_end_date: '2024-12-31',
    status: 'ACTIVE',
    created_by: 'user1',
    created_at: '2024-01-01T00:00:00Z',
    budget_usd: '800000',
    actual_usd: '200000',
    percent_complete: 25,
    open_ncrs: 1,
    claims_awaiting_certification: 2,
    last_site_report: '2024-06-01'
  }
];

describe('ConstructionWorkspace', () => {
    const mockNotify = vi.fn();
    const mockFail = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (api.fetchProjects as Mock).mockResolvedValue(mockProjects);
        (api.fetchTenders as Mock).mockResolvedValue([]);
        (api.fetchSubcontracts as Mock).mockResolvedValue([]);
        (api.fetchJobCostingSummary as Mock).mockResolvedValue({ budget: [], costs: [], metrics: { total_budget: '0', total_costs: '0', variance: '0' } });
        (api.fetchEquipment as Mock).mockResolvedValue([]);
        (api.fetchQualitySummary as Mock).mockResolvedValue({ total_inspections: 0, pass_rate: 0, open_ncrs: 0, resolved_ncrs: 0 });
        (api.fetchInspections as Mock).mockResolvedValue([]);
        (api.fetchNcrs as Mock).mockResolvedValue([]);
        (api.fetchSiteReports as Mock).mockResolvedValue([]);
    });

    it('should prompt to sign in when session is null', () => {
        render(
            <ConstructionWorkspace
                session={null}
                notify={mockNotify}
                fail={mockFail}
            />
        );
        expect(screen.getByText(/Sign in with a construction role/i)).toBeInTheDocument();
    });

    it('should render subcontractor portal for SUBCONTRACTOR role', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['SUBCONTRACTOR'], expiresAt: null };

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        expect(screen.getByText('Subcontractor portal')).toBeInTheDocument();
    });

    it('should show unauthorized message for non-construction roles', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['SOME_OTHER_ROLE'], expiresAt: null };

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        expect(screen.getByText('Your sign-in has no construction role.')).toBeInTheDocument();
    });

    it('should render StaffWorkspace for construction roles', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['PROJECT_MANAGER'], expiresAt: null };

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        expect(screen.getByText('Project portfolio')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        expect(screen.getByText('PROJ-1')).toBeInTheDocument();
        expect(screen.getByText('PROJ-1 — Test Project 1')).toBeInTheDocument();
        expect(screen.getByText('Site A · client Client X · 2024-01-01 → 2024-12-31 · contract $1,000,000.00')).toBeInTheDocument();
    });

    it('should switch between project modules', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['PROJECT_MANAGER'], expiresAt: null };

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        await waitFor(() => {
            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        const progressTab = screen.getByText('Site Progress');
        await act(async () => {
            fireEvent.click(progressTab);
        });
        expect(progressTab.closest('button')).toHaveClass('bg-amber-600');

        const tendersTab = screen.getByText('Tenders & Subcontracts');
        await act(async () => {
            fireEvent.click(tendersTab);
        });
        expect(tendersTab.closest('button')).toHaveClass('bg-amber-600');

        const qualityTab = screen.getByText('Quality Control');
        await act(async () => {
            fireEvent.click(qualityTab);
        });
        expect(qualityTab.closest('button')).toHaveClass('bg-amber-600');

        const plantTab = screen.getByText('Plant & Maintenance');
        await act(async () => {
            fireEvent.click(plantTab);
        });
        expect(plantTab.closest('button')).toHaveClass('bg-amber-600');
    });

    it('should allow PROJECT_MANAGER to open create project form', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['PROJECT_MANAGER'], expiresAt: null };

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        const newProjectBtn = screen.getByText('+ New project');
        await act(async () => {
            fireEvent.click(newProjectBtn);
        });

        expect(screen.getByText('New construction project')).toBeInTheDocument();
        expect(screen.getByLabelText('Code')).toBeInTheDocument();
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Site location')).toBeInTheDocument();

        // click again to close
        const closeBtn = screen.getByText('Close');
        await act(async () => {
            fireEvent.click(closeBtn);
        });

        expect(screen.queryByText('New construction project')).not.toBeInTheDocument();
    });

    it('should create new project and update selected project', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['PROJECT_MANAGER'], expiresAt: null };
        (api.createProject as Mock).mockResolvedValue({ project_id: 'p-new' });

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        const newProjectBtn = screen.getByText('+ New project');
        await act(async () => {
            fireEvent.click(newProjectBtn);
        });

        await act(async () => {
            fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'PROJ-NEW' } });
            fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Test Project' } });
            fireEvent.change(screen.getByLabelText('Site location'), { target: { value: 'Site B' } });
            fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Client Y' } });
            fireEvent.change(screen.getByLabelText('Contract value (USD)'), { target: { value: '500000' } });
            fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-01-01' } });
            fireEvent.change(screen.getByLabelText('Planned completion'), { target: { value: '2025-12-31' } });
        });

        // Set up next fetchProjects call to return the new project
        const updatedProjects = [
            ...mockProjects,
            {
                project_id: 'p-new',
                code: 'PROJ-NEW',
                name: 'New Test Project',
                development_id: null,
                site_location: 'Site B',
                client_name: 'Client Y',
                contract_value_usd: '500000',
                start_date: '2025-01-01',
                planned_end_date: '2025-12-31',
                status: 'ACTIVE' as const,
                created_by: 'user1',
                created_at: '2024-01-01T00:00:00Z',
            }
        ];

        (api.fetchProjects as Mock).mockResolvedValueOnce(updatedProjects);

        await act(async () => {
            fireEvent.click(screen.getByText('Create project'));
        });

        expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({
            code: 'PROJ-NEW',
            name: 'New Test Project',
            siteLocation: 'Site B'
        }));

        expect(mockNotify).toHaveBeenCalledWith('Project PROJ-NEW created');
    });

    it('should allow PROJECT_MANAGER to change project status', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['PROJECT_MANAGER'], expiresAt: null };
        (api.setProjectStatus as Mock) = vi.fn().mockResolvedValue(true);
        window.confirm = vi.fn().mockReturnValue(true);

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        await waitFor(() => {
            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        const statusBtns = screen.getAllByRole('button').filter(b => b.textContent === 'On Hold' || b.textContent === 'Completed');
        expect(statusBtns.length).toBeGreaterThan(0);

        await act(async () => {
            fireEvent.click(statusBtns[0]);
        });

        expect(api.setProjectStatus).toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalled();
    });

    it('should render correct stats and progress bars for project portfolio', async () => {
        const session: Session = { token: 't', sub: 'u1', roles: ['PROJECT_MANAGER'], expiresAt: null };

        await act(async () => {
            render(
                <ConstructionWorkspace
                    session={session}
                    notify={mockNotify}
                    fail={mockFail}
                />
            );
        });

        await waitFor(() => {
            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        expect(screen.getByText('25%')).toBeInTheDocument();
        expect(screen.getByText('$200,000.00 spent')).toBeInTheDocument();
        expect(screen.getByText('of $800,000.00')).toBeInTheDocument();
        expect(screen.getByText('1 open NCR')).toBeInTheDocument();
        expect(screen.getByText('2 claim(s) to certify')).toBeInTheDocument();
        expect(screen.getByText('Diary 2024-06-01')).toBeInTheDocument();
    });
});
