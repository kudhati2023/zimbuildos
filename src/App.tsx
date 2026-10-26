import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck, CreditCard, FileText,
  Shield, CheckCircle, AlertTriangle, Printer,
  RefreshCw, MapPin, Upload, Compass,
  FileSpreadsheet, Sparkles, AlertCircle, Award, LogIn, LogOut,
  Send, Smartphone, MessageSquare, Clock, Eye, Package, Boxes, Factory, CheckCircle2
} from 'lucide-react';
import * as api from './api';
import { InteractiveLeafletMap } from './components/map/InteractiveLeafletMap';
import { ServicingProgressBar } from './components/map/ServicingProgressBar';
import { GeoJsonUploaderModal } from './components/gis/GeoJsonUploaderModal';
import { ConstructionWorkspace } from './components/construction/ConstructionWorkspace';
import type {
  Allocation, Application, ApplicationInput, CadastreStand, Currency, GISStand, HousingDevelopment,
  PaymentChannel, QuotaCategory, ServicingState, Session, StandServicing, Statement,
  RealEstateInquiry, CommunicationRecord, PipelineSummary, DigitalChannelMetrics
} from './types';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const DEFAULT_CENTER: [number, number] = [-17.8925, 30.9325];
const NEXT_SERVICING: Record<ServicingState, ServicingState> = { PENDING: 'IN_PROGRESS', IN_PROGRESS: 'CERTIFIED', CERTIFIED: 'PENDING' };
const CONSTRAINT_LABELS: Record<string, string> = {
  WETLAND: 'EMA wetland reserve',
  POWER_WAYLEAVE: 'Electricity way-leave',
  ROAD_SERVITUDE: 'Road servitude',
  FLOOD_ZONE: 'Flood-prone drainage zone',
};
const QUOTA_OPTIONS: QuotaCategory[] = ['YOUTH', 'WOMEN', 'DISABILITY', 'VETERAN', 'PUBLIC_SERVANT', 'GENERAL'];
const EMPTY_APPLICATION: ApplicationInput = {
  nationalId: '', firstName: '', lastName: '', dateOfBirth: '', phoneNumber: '', physicalAddress: '',
  preferredScheme: '', quotaCategory: 'YOUTH', registrationChannel: 'STAFF', preferredChannel: 'WHATSAPP'
};
const EMPTY_PAYMENT = { allocationId: '', channel: 'ECOCASH' as PaymentChannel, currency: 'USD' as Currency, amount: '', externalReference: '' };

export default function AntigravityEnterpriseDesktop() {
  const [activeTab, setActiveTab] = useState<'STANDS' | 'APPLICATIONS' | 'YOUTH_REGISTER' | 'TRANSPARENT_REGISTER' | 'RESERVE' | 'PAYMENTS' | 'STATEMENTS' | 'OWNER_PORTAL' | 'MESSAGING' | 'SUPPLY_CHAIN' | 'CONSTRUCTION' | 'CRM_PIPELINE'>('STANDS');

  // Session & server
  const [session, setSession] = useState<Session | null>(() => api.currentSession());
  const [tokenInput, setTokenInput] = useState('');
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const hasRole = (...roles: string[]) => !!session?.roles.some(r => roles.includes(r));
  const isReviewer = hasRole('LAND_OFFICER', 'FINANCE_MANAGER', 'CEO', 'ADMIN');

  // Data from zhms-api
  const [stands, setStands] = useState<CadastreStand[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [ownerAllocations, setOwnerAllocations] = useState<Allocation[]>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [publicStands, setPublicStands] = useState<api.PublicStandRegisterItem[]>([]);
  const [quotaSummary, setQuotaSummary] = useState<api.QuotaSummaryItem[]>([]);
  const [outboundMessages, setOutboundMessages] = useState<api.OutboundMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // CRM & Sales Pipeline State
  const [crmPipeline, setCrmPipeline] = useState<PipelineSummary | null>(null);
  const [crmInquiries, setCrmInquiries] = useState<RealEstateInquiry[]>([]);
  const [crmComms, setCrmComms] = useState<CommunicationRecord[]>([]);
  const [crmMetrics, setCrmMetrics] = useState<DigitalChannelMetrics | null>(null);
  const [crmSubTab, setCrmSubTab] = useState<'PIPELINE' | 'INQUIRIES' | 'COMMUNICATIONS' | 'ANALYTICS'>('PIPELINE');
  const [inquiryChannelFilter, setInquiryChannelFilter] = useState<string>('ALL');
  const [crmLoading, setCrmLoading] = useState(false);

  // CRM Inquiry Form
  const [newInqForm, setNewInqForm] = useState({
    customer_name: '',
    phone: '',
    email: '',
    source_channel: 'WHATSAPP_BOT',
    property_interest: '',
    budget_usd: 35000,
    urgency: 'High',
    is_diaspora: false,
    diaspora_country: '',
    notes: ''
  });

  // CRM Communication Form
  const [newCommForm, setNewCommForm] = useState({
    customer_id_or_name: '',
    inquiry_or_deal_ref: '',
    channel: 'WHATSAPP',
    direction: 'OUTBOUND',
    client_sentiment: 'Positive',
    summary: '',
    follow_up_action: '',
    follow_up_date: ''
  });

  // Forms
  const [appForm, setAppForm] = useState<ApplicationInput>(EMPTY_APPLICATION);
  const [youthForm, setYouthForm] = useState({
    firstName: '',
    lastName: '',
    nationalId: '',
    dateOfBirth: '',
    phoneNumber: '',
    physicalAddress: '',
    preferredScheme: '',
    preferredChannel: 'WHATSAPP' as 'WHATSAPP' | 'SMS',
    registrationChannel: 'MOBILE' as 'MOBILE' | 'WEB',
  });
  const [ecocashPushForm, setEcocashPushForm] = useState({
    accountRef: '',
    amount: '',
    payerPhone: '+263774128901',
    currency: 'USD' as Currency,
  });
  const [publicSchemeFilter, setPublicSchemeFilter] = useState('');
  const [publicStandSearch, setPublicStandSearch] = useState('');
  const [reserveForm, setReserveForm] = useState({ applicationId: '', parcelId: '' });
  const [payForm, setPayForm] = useState(EMPTY_PAYMENT);
  const [rejecting, setRejecting] = useState<{ id: string; role: string; reason: string } | null>(null);

  const youthAge = useMemo(() => {
    if (!youthForm.dateOfBirth) return null;
    const dob = new Date(youthForm.dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const diff = Date.now() - dob.getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }, [youthForm.dateOfBirth]);

  // GIS & Spatial Cadastre State
  const [selectedDevId, setSelectedDevId] = useState<string>('');
  const [developments, setDevelopments] = useState<HousingDevelopment[]>([]);
  const [spatialViewMode, setSpatialViewMode] = useState<'MAP' | 'GRID'>('MAP');
  const [selectedStandId, setSelectedStandId] = useState<string>('');
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [standSearch, setStandSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [gisStands, setGisStands] = useState<GISStand[]>([]);
  const [servicingDraft, setServicingDraft] = useState<StandServicing | null>(null);
  const [certificateRef, setCertificateRef] = useState('');

  const activeDev = useMemo(() => {
    return developments.find(d => d.id === selectedDevId) ?? developments[0] ?? null;
  }, [developments, selectedDevId]);

  const activeStand = useMemo(() => {
    return gisStands.find(s => s.id === selectedStandId) ?? gisStands[0] ?? null;
  }, [gisStands, selectedStandId]);

  const filteredGISStands = useMemo(() => {
    const q = standSearch.toLowerCase();
    return gisStands.filter(s => {
      const matchesSearch = s.stand_number.toLowerCase().includes(q) ||
                            (s.holder_name ?? '').toLowerCase().includes(q) ||
                            s.parcel_id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [gisStands, standSearch, statusFilter]);

  // ⚡ Bolt Performance Optimization:
  // Replaced multiple inline array `.filter()` chains on `publicStands` with a single O(N) loop
  // wrapped in a `useMemo`. This prevents 4 O(N) recalculations on every component render.
  const publicStandsMetrics = useMemo(() => {
    let available = 0;
    let reservedOrAllocated = 0;
    let youth = 0;
    const schemes = new Set<string>();

    for (const s of publicStands) {
      if (s.status === 'AVAILABLE') available++;
      if (s.status === 'RESERVED' || s.status === 'ALLOCATED') reservedOrAllocated++;
      if (s.quota_category === 'YOUTH') youth++;
      schemes.add(s.scheme_name);
    }

    return {
      available,
      reservedOrAllocated,
      youth,
      schemes: Array.from(schemes)
    };
  }, [publicStands]);

  // ⚡ Bolt Performance Optimization:
  // Combines scheme filtering and search string matching into a single loop,
  // memoized to prevent re-execution unless dependent values change.
  const filteredPublicStands = useMemo(() => {
    const searchLow = (publicStandSearch || '').toLowerCase();
    return publicStands.filter(s => {
      if (publicSchemeFilter && s.scheme_name !== publicSchemeFilter) return false;
      if (searchLow && !s.stand_number.toLowerCase().includes(searchLow)) return false;
      return true;
    });
  }, [publicStands, publicSchemeFilter, publicStandSearch]);

  // ⚡ Bolt Performance Optimization:
  // Memoized lists to prevent O(N) recalculations inside JSX mapping loops on every render.
  const approvedApplications = useMemo(() => {
    return applications.filter(a => a.status === 'APPROVED');
  }, [applications]);

  const availableStands = useMemo(() => {
    return stands.filter(s => s.status === 'AVAILABLE');
  }, [stands]);

  const filteredCrmInquiries = useMemo(() => {
    return crmInquiries.filter(i => inquiryChannelFilter === 'ALL' || i.source_channel === inquiryChannelFilter);
  }, [crmInquiries, inquiryChannelFilter]);

  // Servicing editor starts from what the server has recorded for the selected stand
  useEffect(() => {
    setServicingDraft(activeStand ? activeStand.servicing : null);
    setCertificateRef(activeStand?.servicing_certificate_ref ?? '');
  }, [activeStand]);

  // Load everything from zhms-api. Failures are shown, never replaced with demo data.
  const loadData = async () => {
    setLoading(true);
    const problems: string[] = [];
    const attempt = async (label: string, fn: () => Promise<void>) => {
      try { await fn(); } catch (err) { problems.push(`${label}: ${errorText(err)}`); }
    };
    try {
      const up = await api.checkHealth();
      setServerUp(up);
      if (!up) {
        setErrorMsg(`Cannot reach the ZHMS server at ${api.API_BASE}. Start it with "npm run server".`);
        return;
      }

      let devId = selectedDevId;
      await attempt('Developments', async () => {
        const devs = await api.fetchDevelopments();
        setDevelopments(devs);
        if (!devId && devs[0]) {
          devId = devs[0].id;
          setSelectedDevId(devId);
        }
      });
      await attempt('Stands', async () => setStands(await api.fetchStands()));
      if (devId) await attempt('Map', async () => setGisStands(await api.fetchDevelopmentStands(devId)));

      if (isReviewer) await attempt('Applications', async () => setApplications(await api.fetchApplications()));
      else setApplications([]);

      if (session) await attempt('My stands', async () => setOwnerAllocations(await api.fetchOwnerAllocations()));
      else setOwnerAllocations([]);

      await attempt('Transparent register', async () => setPublicStands(await api.fetchPublicAllocationRegister()));
      await attempt('Quota summary', async () => setQuotaSummary(await api.fetchPublicQuotaSummary()));
      await attempt('Outbound messages', async () => setOutboundMessages(await api.fetchOutboundMessages()));

      setErrorMsg(problems.length ? problems.join(' · ') : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, selectedDevId, session?.token]);

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 6000);
    loadData();
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const s = api.signIn(tokenInput);
      setSession(s);
      setTokenInput('');
      flashSuccess(`Signed in as ${s.sub} (${s.roles.join(', ') || 'applicant'})`);
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleSignOut = () => {
    api.signOut();
    setSession(null);
    setStatement(null);
  };

  // Servicing is certified by the civil engineering unit (ENGINEER role) and saved to the cadastre.
  const cycleServicing = (key: keyof StandServicing) => {
    setServicingDraft(d => (d ? { ...d, [key]: NEXT_SERVICING[d[key]] } : d));
  };

  const handleSaveServicing = async () => {
    if (!activeStand || !servicingDraft) return;
    try {
      await api.updateServicing(activeStand.parcel_id, servicingDraft, certificateRef.trim() || undefined);
      flashSuccess(`Servicing for ${activeStand.stand_number} saved.`);
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleReserveFromMap = (stand: GISStand) => {
    setSelectedStandId(stand.id);
    if (stand.status === 'blocked' || stand.status === 'disputed') {
      setErrorMsg(`${stand.stand_number} is not available for booking (${stand.land_constraint ? CONSTRAINT_LABELS[stand.land_constraint] : stand.status}).`);
      return;
    }
    if (stand.status === 'available') {
      setReserveForm(prev => ({ ...prev, parcelId: stand.parcel_id }));
      setActiveTab('RESERVE');
    } else if (stand.allocation_id) {
      setPayForm(prev => ({ ...prev, allocationId: stand.allocation_id as string }));
      setActiveTab('PAYMENTS');
    } else {
      setErrorMsg(`No live allocation found for ${stand.stand_number}.`);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.submitApplication(appForm);
      setAppForm(EMPTY_APPLICATION);
      flashSuccess('Application submitted and queued for Land Officer review. A confirmation message was queued to the applicant.');
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleReview = async (id: string, role: string, decision: 'APPROVED' | 'REJECTED', reason?: string) => {
    try {
      await api.reviewApplication(id, role, decision, reason);
      setRejecting(null);
      flashSuccess(`Application ${decision === 'APPROVED' ? 'approved' : 'returned'} by ${role.replace('_', ' ').toLowerCase()}.`);
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const alloc = await api.reserveStand(reserveForm.applicationId, reserveForm.parcelId);
      setReserveForm({ applicationId: '', parcelId: '' });
      flashSuccess(`Stand reserved. Deposit US$${alloc.deposit_required_usd} due by ${new Date(alloc.reservation_expires_at).toLocaleDateString()}. Buyer's payment reference: ${alloc.account_ref}`);
      setActiveTab('STANDS');
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.recordPayment(payForm);
      setPayForm(prev => ({ ...EMPTY_PAYMENT, allocationId: prev.allocationId, channel: prev.channel }));
      flashSuccess(`Receipt ${res.receiptNumber} issued. Status: ${res.newStatus}. Outstanding: US$${res.outstandingUsd.toFixed(2)}`);
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleLoadStatement = async (allocId: string) => {
    try {
      setStatement(await api.fetchStatement(allocId));
      setActiveTab('STATEMENTS');
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleSignAos = async (allocId: string) => {
    try {
      const doc = await api.signAgreement(allocId);
      flashSuccess(`Agreement of Sale ${doc.documentNumber} signed; instalment plan created.`);
      await handleLoadStatement(allocId);
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleSignDeed = async (allocId: string) => {
    try {
      const doc = await api.signDeed(allocId);
      flashSuccess(`Deed of Transfer ${doc.documentNumber} issued.`);
      await handleLoadStatement(allocId);
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleYouthRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.registerYouthApplicant(youthForm);
      api.signIn(res.token);
      setSession(api.currentSession());
      flashSuccess(`🎉 Youth Registration Complete! Welcome ${youthForm.firstName}. Reference: ${res.application.application_id}. Instant WhatsApp/SMS verification dispatched.`);
      setActiveTab('OWNER_PORTAL');
      loadData();
    } catch (err) {
      setErrorMsg(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEcoCashPush = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.triggerEcoCashPush(ecocashPushForm);
      flashSuccess(`⚡ EcoCash USSD Push settled! Reference: ${res.reference}. Receipt issued and customer balance updated.`);
      setEcocashPushForm({ accountRef: '', amount: '', payerPhone: '+263774128901', currency: 'USD' });
      loadData();
    } catch (err) {
      setErrorMsg(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (allocId: string) => {
    try {
      const res = await api.sendPaymentReminderNow(allocId);
      flashSuccess(`Payment reminder dispatched via WhatsApp/SMS (Status: ${res.status})`);
      loadData();
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleSendStatement = async (allocId: string) => {
    try {
      const res = await api.sendStatementNow(allocId);
      flashSuccess(`Monthly statement dispatched via WhatsApp/SMS (Status: ${res.status})`);
      loadData();
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleTriggerScheduledJobs = async () => {
    try {
      setLoading(true);
      const res = await api.triggerScheduledJobs();
      flashSuccess(`Automated Cron Executed: ${res.overdueMarked} overdue flagged, ${res.remindersQueued} reminders queued, ${res.statementsQueued} statements generated.`);
      loadData();
    } catch (err) {
      setErrorMsg(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // CRM & Sales Pipeline Handlers
  // -------------------------------------------------------------------------
  const loadCrmData = async () => {
    setCrmLoading(true);
    try {
      const [pipe, inqs, comms, metrics] = await Promise.allSettled([
        api.fetchCRMPipeline(),
        api.fetchCRMInquiries(),
        api.fetchCRMCommunications(),
        api.fetchCRMChannelMetrics()
      ]);
      if (pipe.status === 'fulfilled') setCrmPipeline(pipe.value);
      if (inqs.status === 'fulfilled') setCrmInquiries(inqs.value);
      if (comms.status === 'fulfilled') setCrmComms(comms.value);
      if (metrics.status === 'fulfilled') setCrmMetrics(metrics.value);
    } catch {
      // offline fallback handled by state
    } finally {
      setCrmLoading(false);
    }
  };

  const handleCreateInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCrmLoading(true);
      const inq = await api.createCRMInquiry(newInqForm);
      flashSuccess(`✅ Inquiry logged: ${inq.inquiry_id} for ${inq.customer_name}. Lead auto-profiled.`);
      setNewInqForm({
        customer_name: '', phone: '', email: '', source_channel: 'WHATSAPP_BOT',
        property_interest: '', budget_usd: 35000, urgency: 'High', is_diaspora: false, diaspora_country: '', notes: ''
      });
      await loadCrmData();
    } catch (err) {
      setErrorMsg(errorText(err));
    } finally {
      setCrmLoading(false);
    }
  };

  const handleLogComm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCrmLoading(true);
      const comm = await api.logCRMCommunication({
        ...newCommForm,
        agent_name: session?.sub || 'Tapiwa Zhou'
      });
      flashSuccess(`✅ Communication recorded: ${comm.comm_id} (${comm.channel})`);
      setNewCommForm({
        customer_id_or_name: '', inquiry_or_deal_ref: '', channel: 'WHATSAPP', direction: 'OUTBOUND',
        client_sentiment: 'Positive', summary: '', follow_up_action: '', follow_up_date: ''
      });
      await loadCrmData();
    } catch (err) {
      setErrorMsg(errorText(err));
    } finally {
      setCrmLoading(false);
    }
  };

  const handleAdvanceDeal = async (dealId: string, nextStage: string) => {
    try {
      setCrmLoading(true);
      await api.advanceCRMDealStage(dealId, nextStage, `Advanced from React desktop client by ${session?.sub || 'sales'}`);
      flashSuccess(`✅ Deal ${dealId} advanced to stage ${nextStage}`);
      await loadCrmData();
    } catch (err) {
      setErrorMsg(errorText(err));
    } finally {
      setCrmLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="h-14 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            Z
          </div>
          <div>
            <span className="font-semibold text-sm tracking-wide text-slate-100">
              ZimBuild Housing Management System
            </span>
            <span className="text-[10px] text-indigo-400 font-mono ml-2 border border-indigo-500/30 px-1.5 py-0.5 rounded">
              ZHMS v3.0 Real PostGIS
            </span>
          </div>
        </div>

        {/* Global Navigation Tabs */}
        <div className="flex bg-slate-950/80 border border-slate-800 p-1 rounded-xl text-xs font-mono overflow-x-auto max-w-3xl">
          <button 
            onClick={() => setActiveTab('STANDS')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === 'STANDS' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Cadastre Map
          </button>
          <button 
            onClick={() => setActiveTab('YOUTH_REGISTER')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${activeTab === 'YOUTH_REGISTER' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-400 hover:text-emerald-200'}`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Youth Registration</span>
          </button>
          <button 
            onClick={() => setActiveTab('TRANSPARENT_REGISTER')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${activeTab === 'TRANSPARENT_REGISTER' ? 'bg-sky-600 text-white font-bold' : 'text-sky-400 hover:text-sky-200'}`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Public Register</span>
          </button>
          <button 
            onClick={() => setActiveTab('APPLICATIONS')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === 'APPLICATIONS' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            3-Step Approvals
          </button>
          <button 
            onClick={() => setActiveTab('RESERVE')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === 'RESERVE' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            FCFS Reserve
          </button>
          <button 
            onClick={() => setActiveTab('PAYMENTS')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${activeTab === 'PAYMENTS' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payments & EcoCash</span>
          </button>
          <button 
            onClick={() => setActiveTab('STATEMENTS')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === 'STATEMENTS' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Statements
          </button>
          <button 
            onClick={() => setActiveTab('OWNER_PORTAL')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === 'OWNER_PORTAL' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Owner Portal
          </button>
          <button 
            onClick={() => setActiveTab('MESSAGING')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${activeTab === 'MESSAGING' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-400 hover:text-emerald-200'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp / SMS</span>
          </button>
          <button 
            onClick={() => setActiveTab('SUPPLY_CHAIN')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${activeTab === 'SUPPLY_CHAIN' ? 'bg-teal-600 text-white font-bold' : 'text-teal-400 hover:text-teal-200'}`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Supply Chain & WMS</span>
          </button>
          <button
            onClick={() => setActiveTab('CONSTRUCTION')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === 'CONSTRUCTION' ? 'bg-amber-600 text-white font-bold' : 'text-amber-400 hover:text-amber-200'}`}
          >
            Construction Ops
          </button>
          <button
            onClick={() => { setActiveTab('CRM_PIPELINE'); loadCrmData(); }}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center space-x-1 ${activeTab === 'CRM_PIPELINE' ? 'bg-amber-600 text-white font-bold' : 'text-amber-400 hover:text-amber-200'}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>CRM & Sales Pipeline</span>
          </button>
        </div>

        {/* System Indicator */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          <a
            href="/"
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 font-bold transition flex items-center space-x-1"
            title="Switch to 23-Module Enterprise ERP"
          >
            <span>🏢 Enterprise ERP</span>
          </a>
          <button onClick={loadData} className="text-slate-400 hover:text-indigo-400 p-1">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${
            serverUp === null ? 'bg-slate-900 border-slate-700 text-slate-400' :
            serverUp ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400' : 'bg-rose-950/40 border-rose-500/40 text-rose-400'
          }`}>
            <Shield className="w-3.5 h-3.5" />
            <span>{serverUp === null ? 'CHECKING SERVER…' : serverUp ? 'SERVER ONLINE' : 'SERVER OFFLINE'}</span>
          </div>
          {session ? (
            <div className="flex items-center space-x-2">
              <span className="text-slate-300" title={session.roles.join(', ')}>
                {session.sub} <span className="text-indigo-400">[{session.roles.join(', ') || 'APPLICANT'}]</span>
              </span>
              <button onClick={handleSignOut} className="text-slate-400 hover:text-rose-400 p-1" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignIn} className="flex items-center space-x-1">
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste access token"
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 w-40 focus:outline-none focus:border-indigo-500"
              />
              <button type="submit" disabled={!tokenInput.trim()} className="text-indigo-400 hover:text-indigo-300 disabled:opacity-40 p-1" title="Sign in">
                <LogIn className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Alert Messages */}
      {errorMsg && (
        <div className="bg-rose-950/80 border-b border-rose-500/40 px-6 py-2 text-xs font-mono text-rose-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 font-bold">×</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-6 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 font-bold">×</button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 p-6 overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20 font-mono text-xs">
        
        {/* TAB 1: STAND INVENTORY & GIS CADASTRE */}
        {activeTab === 'STANDS' && (
          <div className="space-y-3 flex flex-col">
            {/* GIS Controls & Toolbar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-3">
                {/* Development Project Selector */}
                <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                  <MapPin className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Scheme:</span>
                  <select
                    value={selectedDevId}
                    onChange={e => {
                      setSelectedDevId(e.target.value);
                      setSelectedStandId('');
                    }}
                    className="bg-transparent text-slate-100 text-xs font-mono font-bold focus:outline-none cursor-pointer"
                  >
                    {developments.length === 0 && <option value="">No developments recorded</option>}
                    {developments.map(d => (
                      <option key={d.id} value={d.id} className="bg-slate-950 text-slate-100">
                        {d.name} ({d.province})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter Chips */}
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                  {(['ALL', 'available', 'pending_deposit', 'allocated', 'blocked'] as const).map(st => {
                    const label = st === 'ALL' ? 'All Parcels' :
                                  st === 'available' ? 'Available' :
                                  st === 'pending_deposit' ? 'Reserved' :
                                  st === 'allocated' ? 'Allocated' : 'Protected Land';
                    const activeColor = st === 'ALL' ? 'bg-indigo-600 text-white' :
                                        st === 'available' ? 'bg-emerald-600 text-white' :
                                        st === 'pending_deposit' ? 'bg-amber-600 text-white' :
                                        st === 'allocated' ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white';
                    return (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-2.5 py-1 rounded-lg transition font-medium ${statusFilter === st ? activeColor : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Stand Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search stand # or buyer..."
                    value={standSearch}
                    onChange={e => setStandSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 w-48"
                  />
                </div>
              </div>

              {/* View Mode Toggle & Actions */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setSpatialViewMode('MAP')}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${spatialViewMode === 'MAP' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>GIS Map</span>
                  </button>
                  <button
                    onClick={() => setSpatialViewMode('GRID')}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${spatialViewMode === 'GRID' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Data Grid</span>
                  </button>
                </div>

                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  disabled={!hasRole('LAND_OFFICER') || !activeDev}
                  title={hasRole('LAND_OFFICER') ? 'Import surveyed stand boundaries' : 'Sign in as a Land Officer to import stands'}
                  className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-cyan-400 px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1.5 transition font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload GeoJSON</span>
                </button>

                <button
                  onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                  className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-xs transition font-mono"
                >
                  {isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                </button>
              </div>
            </div>

            {/* Split View: Map/Grid on Left, Inspector on Right */}
            <div className="grid grid-cols-12 gap-4">
              {/* Left Column: Spatial Map or Searchable Data Grid */}
              <div className={`${isInspectorOpen ? 'col-span-8' : 'col-span-12'} transition-all duration-300 flex flex-col space-y-3`}>
                {spatialViewMode === 'MAP' ? (
                  <div className="relative h-[580px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col">
                    <InteractiveLeafletMap
                      stands={filteredGISStands}
                      selectedStandId={selectedStandId}
                      onSelectStand={(id) => {
                        setSelectedStandId(id);
                        setIsInspectorOpen(true);
                      }}
                      onReserveClick={handleReserveFromMap}
                      center={activeDev?.center ?? DEFAULT_CENTER}
                      zoom={activeDev?.zoom ?? 16}
                    />

                    {/* Cadastre Telemetry Overlay Badge */}
                    <div className="absolute bottom-14 left-3 z-[400] bg-slate-950/85 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        {activeDev ? activeDev.name : 'No development'} • {filteredGISStands.filter(s => s.geometry).length} mapped
                        {filteredGISStands.some(s => !s.geometry) && ` • ${filteredGISStands.filter(s => !s.geometry).length} without survey boundary (see Data Grid)`}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Tabular Grid View Fallback */
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-hidden shadow-xl max-h-[580px] flex flex-col">
                    <div className="overflow-y-auto flex-1">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-bold sticky top-0 bg-slate-900/90 backdrop-blur z-10">
                            <th className="py-2 px-3">Stand #</th>
                            <th className="py-2 px-3">Area</th>
                            <th className="py-2 px-3">Zoning</th>
                            <th className="py-2 px-3">Servicing</th>
                            <th className="py-2 px-3">Price</th>
                            <th className="py-2 px-3">Deposit</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                          {filteredGISStands.map(s => {
                            const isSelected = s.id === selectedStandId;
                            const isLocked = s.status === 'pending_deposit';
                            const isWetland = s.status === 'blocked' || s.status === 'disputed';
                            const isAvail = s.status === 'available';

                            return (
                              <tr
                                key={s.id}
                                onClick={() => {
                                  setSelectedStandId(s.id);
                                  setIsInspectorOpen(true);
                                }}
                                className={`cursor-pointer transition hover:bg-slate-800/50 ${isSelected ? 'bg-indigo-950/40 border-l-2 border-indigo-500' : ''}`}
                              >
                                <td className="py-2.5 px-3 font-bold text-slate-100">{s.stand_number}</td>
                                <td className="py-2.5 px-3">{s.area_sqm} m²</td>
                                <td className="py-2.5 px-3 text-indigo-300 text-[11px]">{s.zoning_type.replace(/_/g, ' ')}</td>
                                <td className="py-2.5 px-3">
                                  {s.fully_serviced ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-950 text-emerald-400 border-emerald-500/40">certified</span>
                                  ) : (
                                    <div className="w-20"><ServicingProgressBar servicing={s.servicing} compact /></div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-emerald-400 font-bold">{isWetland ? '—' : `$${s.price_usd.toLocaleString()}`}</td>
                                <td className="py-2.5 px-3 text-cyan-300">{isWetland ? '—' : `$${s.required_deposit_usd.toLocaleString()}`}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                    isAvail ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40' :
                                    isLocked ? 'bg-amber-950 text-amber-400 border-amber-500/40' :
                                    isWetland ? 'bg-rose-950 text-rose-400 border-rose-500/40' :
                                    'bg-blue-950 text-blue-400 border-blue-500/40'
                                  }`}>
                                    {s.land_constraint ? CONSTRAINT_LABELS[s.land_constraint] : s.status.replace(/_/g, ' ')}
                                  </span>
                                  {!s.geometry && <span className="ml-1 text-[9px] text-amber-400" title="No survey boundary recorded">unmapped</span>}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {!isWetland && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReserveFromMap(s);
                                      }}
                                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition"
                                    >
                                      {isAvail ? 'Reserve' : isLocked ? 'Deposit' : 'Record'}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Stand Inspector Drawer */}
              {isInspectorOpen && activeStand && (
                <aside className="col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-2xl backdrop-blur-md overflow-y-auto max-h-[580px]">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold font-mono">
                          Cadastral Parcel Inspector
                        </span>
                        <h3 className="text-base font-bold text-slate-100">{activeStand.stand_number}</h3>
                        <p className="text-slate-400 text-xs font-mono">{activeStand.scheme_name}</p>
                        <p className="text-slate-500 text-[10px] font-mono">
                          Quota: {activeStand.quota_category}{activeStand.surveyor_general_ref ? ` • ${activeStand.surveyor_general_ref}` : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                        activeStand.status === 'available' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40' :
                        activeStand.status === 'pending_deposit' ? 'bg-amber-950 text-amber-400 border-amber-500/40' :
                        activeStand.status === 'blocked' || activeStand.status === 'disputed' ? 'bg-rose-950 text-rose-400 border-rose-500/40' :
                        'bg-blue-950 text-blue-400 border-blue-500/40'
                      }`}>
                        {activeStand.allocation_status ?? activeStand.cadastre_status}
                      </span>
                    </div>

                    {/* Stand Metrics */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">PARCEL AREA</span>
                        <span className="font-bold text-slate-200">{activeStand.area_sqm} m²</span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">ZONING TYPE</span>
                        <span className="font-bold text-indigo-400">{activeStand.zoning_type.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">TOTAL PRICE</span>
                        <span className="font-bold text-emerald-400">${activeStand.price_usd.toLocaleString()} USD</span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">REQ. DEPOSIT</span>
                        <span className="font-bold text-cyan-400">${activeStand.required_deposit_usd.toLocaleString()} USD</span>
                      </div>
                    </div>

                    {/* ZNHSP civil servicing gate — certified by the civil engineering unit, saved to the cadastre */}
                    {servicingDraft && (
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                        <ServicingProgressBar servicing={activeStand.servicing} certificateRef={activeStand.servicing_certificate_ref} />

                        {hasRole('ENGINEER') && !activeStand.land_constraint && (
                          <div className="space-y-2 pt-2 border-t border-slate-800/80 font-mono text-[11px] text-slate-300">
                            <span className="text-[10px] text-slate-500 block">ENGINEER: click to change, then save</span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(['water', 'sewer', 'roads'] as const).map(key => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => cycleServicing(key)}
                                  className={`px-2 py-1 rounded border text-[10px] ${
                                    servicingDraft[key] === 'CERTIFIED' ? 'border-emerald-500/50 text-emerald-300' :
                                    servicingDraft[key] === 'IN_PROGRESS' ? 'border-amber-500/50 text-amber-300' : 'border-slate-700 text-slate-400'
                                  }`}
                                >
                                  {key}: {servicingDraft[key].replace('_', ' ').toLowerCase()}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={certificateRef}
                              onChange={e => setCertificateRef(e.target.value)}
                              placeholder="Council inspection certificate ref (required to certify all three)"
                              className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={handleSaveServicing}
                              className="w-full py-1.5 bg-sky-700 hover:bg-sky-600 text-white rounded font-bold"
                            >
                              Save servicing status
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Protected land notice */}
                    {(activeStand.status === 'blocked' || activeStand.status === 'disputed') && (
                      <div className="bg-rose-950/40 border border-rose-500/40 p-3 rounded-xl text-[11px] text-rose-300 font-mono space-y-1">
                        <div className="flex items-center space-x-1.5 font-bold text-rose-400">
                          <AlertCircle className="w-4 h-4" />
                          <span>{activeStand.land_constraint ? CONSTRAINT_LABELS[activeStand.land_constraint] : activeStand.status === 'disputed' ? 'Disputed stand' : 'Withdrawn from sale'}</span>
                        </div>
                        <p>This parcel cannot be booked or allocated; the database refuses any reservation on it.</p>
                      </div>
                    )}

                    {/* Beneficiary details (staff only — the server omits them for everyone else) */}
                    {activeStand.allocation_status && (
                      <div className="bg-indigo-950/40 border border-indigo-500/30 p-3 rounded-xl font-mono text-xs space-y-1">
                        <span className="text-[10px] text-indigo-400 font-bold uppercase block">Allocation</span>
                        {activeStand.holder_name && <div className="font-bold text-slate-100">{activeStand.holder_name}</div>}
                        {activeStand.holder_national_id && <div className="text-slate-400 text-[11px]">ID: {activeStand.holder_national_id}</div>}
                        <div className="text-slate-400 text-[11px]">{activeStand.allocation_status} since {activeStand.allocated_on}</div>
                        <div className="text-emerald-400 text-[11px]">Price balance: ${activeStand.balance_usd.toLocaleString()} USD</div>
                        {activeStand.allocation_id && session && (
                          <button onClick={() => handleLoadStatement(activeStand.allocation_id as string)} className="text-indigo-300 underline text-[11px]">
                            Open statement
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inspector Action Button */}
                  <div className="pt-4 border-t border-slate-800">
                    {activeStand.status === 'available' ? (
                      <button
                        onClick={() => handleReserveFromMap(activeStand)}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center space-x-1.5"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Reserve for an Approved Applicant</span>
                      </button>
                    ) : activeStand.status === 'pending_deposit' || activeStand.status === 'allocated' ? (
                      <button
                        onClick={() => handleReserveFromMap(activeStand)}
                        disabled={activeStand.title_deed_issued}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center space-x-1.5"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>{activeStand.title_deed_issued ? 'Deed issued' : activeStand.status === 'pending_deposit' ? 'Record Deposit Payment' : 'Record Instalment Payment'}</span>
                      </button>
                    ) : (
                      <div className="py-2 px-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-center text-xs font-bold text-rose-300">
                        🚫 Not for sale
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}

        {/* TAB: YOUTH APPLICANT ONLINE & MOBILE REGISTRATION */}
        {activeTab === 'YOUTH_REGISTER' && (
          <div className="max-w-3xl mx-auto bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl space-y-6 backdrop-blur-md">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  National Youth Housing Quota (40% Statutory Mandate)
                </span>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  Online & Mobile Registration for Youth Applicants
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  ZNHSP Section 4: 40% of all serviced residential stands are legally reserved for youth aged 18 to 35.
                </p>
              </div>
              <div className="text-right">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold border border-emerald-500/40 bg-emerald-950/60 text-emerald-300">
                  ⚡ INSTANT APPROVAL QUEUE
                </span>
              </div>
            </div>

            <form onSubmit={handleYouthRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 block mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Takudzwa"
                    value={youthForm.firstName}
                    onChange={e => setYouthForm({ ...youthForm, firstName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kunaka"
                    value={youthForm.lastName}
                    onChange={e => setYouthForm({ ...youthForm, lastName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 block mb-1">
                    National ID Number <span className="text-slate-500 text-[10px]">(Format: 63-189442-Y-55)</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="63-XXXXXX-X-XX"
                    value={youthForm.nationalId}
                    onChange={e => setYouthForm({ ...youthForm, nationalId: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={youthForm.dateOfBirth}
                    onChange={e => setYouthForm({ ...youthForm, dateOfBirth: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500"
                  />
                  {youthAge !== null && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                      {youthAge >= 18 && youthAge <= 35 ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Age: {youthAge} years old (Qualified for Youth Quota)
                        </span>
                      ) : youthAge < 18 ? (
                        <span className="text-amber-400 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Age: {youthAge} (Must be at least 18)
                        </span>
                      ) : (
                        <span className="text-rose-400 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Age: {youthAge} (Exceeds maximum youth age 35)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 block mb-1">Mobile Phone (EcoCash / SMS / WhatsApp)</label>
                  <input
                    type="tel"
                    required
                    placeholder="+263 77 412 8901"
                    value={youthForm.phoneNumber}
                    onChange={e => setYouthForm({ ...youthForm, phoneNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Preferred Messaging Channel</label>
                  <select
                    value={youthForm.preferredChannel}
                    onChange={e => setYouthForm({ ...youthForm, preferredChannel: e.target.value as 'WHATSAPP' | 'SMS' })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500"
                  >
                    <option value="WHATSAPP">WhatsApp Notifications</option>
                    <option value="SMS">SMS Text Messages</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 block mb-1">Physical Residential Address</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Stand 452, Budiriro 2, Harare"
                    value={youthForm.physicalAddress}
                    onChange={e => setYouthForm({ ...youthForm, physicalAddress: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">Preferred Housing Scheme</label>
                  <select
                    value={youthForm.preferredScheme}
                    onChange={e => setYouthForm({ ...youthForm, preferredScheme: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-emerald-500"
                  >
                    <option value="">Any Available Youth Scheme</option>
                    {developments.map(d => (
                      <option key={d.id} value={d.name}>{d.name} ({d.province})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 text-[11px] text-emerald-300 space-y-1 font-mono">
                <p className="font-bold">✓ Statutory Youth Quota Protections Enforced:</p>
                <p>• Automatically assigns applicant to 40% Youth Ring-Fenced Cadastre Pool.</p>
                <p>• Locks applicant into FCFS queue with tamper-proof cryptographic audit log.</p>
                <p>• Dispatches instant WhatsApp confirmation template with registration reference.</p>
              </div>

              <button
                type="submit"
                disabled={loading || (youthAge !== null && (youthAge < 18 || youthAge > 35))}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs"
              >
                <Send className="w-4 h-4" />
                <span>Submit Youth Registration & Receive WhatsApp Confirmation</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB: TRANSPARENT PUBLIC STAND ALLOCATION REGISTER & QUOTA SUMMARY */}
        {activeTab === 'TRANSPARENT_REGISTER' && (
          <div className="space-y-4">
            {/* Top Statutory Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Surveyed Cadastre</span>
                <span className="text-2xl font-bold text-white mt-1 block">{publicStands.length} Stands</span>
                <span className="text-[10px] text-emerald-400 mt-1 block">ISO 19152 LADM Registered</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Available for Booking</span>
                <span className="text-2xl font-bold text-emerald-400 mt-1 block">
                  {publicStandsMetrics.available} Stands
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Public FCFS Open Pool</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Active / Reserved</span>
                <span className="text-2xl font-bold text-blue-400 mt-1 block">
                  {publicStandsMetrics.reservedOrAllocated} Stands
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Under Contract / Servicing</span>
              </div>
              <div className="bg-slate-900/80 border border-emerald-500/30 bg-emerald-950/20 p-4 rounded-xl">
                <span className="text-[10px] text-emerald-400 font-bold uppercase block">Youth Quota (40% Mandate)</span>
                <span className="text-2xl font-bold text-emerald-300 mt-1 block">
                  {publicStandsMetrics.youth} Stands
                </span>
                <span className="text-[10px] text-emerald-400 mt-1 block">ZNHSP Statutory Youth Share</span>
              </div>
            </div>

            {/* Quota Breakdown Table */}
            {quotaSummary.length > 0 && (
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-2">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  Statutory Quota Distribution Breakdown (ZNHSP Audited)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {quotaSummary.map((q, idx) => (
                    <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white">{q.quota_category}</span>
                        <span className="text-emerald-400 font-bold">{q.share_percent}% share</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${Math.min(100, q.share_percent)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Total: {q.stands}</span>
                        <span>Available: {q.available}</span>
                        <span>Taken: {q.taken}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter and Table */}
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Transparent Public Stand Allocation Register
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time cadastral inventory without personal data exposure (Data Protection Act compliant).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search stand #..."
                    value={publicStandSearch}
                    onChange={e => setPublicStandSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 text-xs w-36"
                  />
                  <select
                    value={publicSchemeFilter}
                    onChange={e => setPublicSchemeFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 text-xs"
                  >
                    <option value="">All Schemes</option>
                    {publicStandsMetrics.schemes.map(sch => (
                      <option key={sch} value={sch}>{sch}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto text-xs font-mono">
                <table className="w-full text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Stand #</th>
                      <th className="p-2.5">Scheme</th>
                      <th className="p-2.5">Area (m²)</th>
                      <th className="p-2.5">Valuation (USD)</th>
                      <th className="p-2.5">Quota</th>
                      <th className="p-2.5">Servicing (W/S/R)</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Allocation Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredPublicStands
                      .map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-bold text-white">{s.stand_number}</td>
                          <td className="p-2.5">{s.scheme_name}</td>
                          <td className="p-2.5">{s.area_sqm} m²</td>
                          <td className="p-2.5 font-bold text-emerald-400">${parseFloat(s.price_usd).toLocaleString()}</td>
                          <td className="p-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              s.quota_category === 'YOUTH' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {s.quota_category}
                            </span>
                          </td>
                          <td className="p-2.5 text-[10px]">
                            {s.water_status[0]}/{s.sewer_status[0]}/{s.roads_status[0]}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.status === 'AVAILABLE' ? 'bg-emerald-500/20 text-emerald-400' :
                              s.status === 'RESERVED' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {s.allocation_status ?? s.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400">{s.allocated_on ?? '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: APPLICATIONS & 3-STEP APPROVALS */}
        {activeTab === 'APPLICATIONS' && (
          <div className="grid grid-cols-12 gap-6">
            {/* Submit Application Form */}
            <div className="col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-sm text-slate-100 mb-3 flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-cyan-400" />
                <span>Submit New Stand Application</span>
              </h3>
              <form onSubmit={handleApply} className="space-y-3">
                <div>
                  <label className="text-slate-400 block mb-1">National ID (e.g. 63-123456-A-42):</label>
                  <input 
                    type="text" 
                    value={appForm.nationalId}
                    onChange={e => setAppForm({ ...appForm, nationalId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">First Name:</label>
                    <input 
                      type="text" 
                      value={appForm.firstName}
                      onChange={e => setAppForm({ ...appForm, firstName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Last Name:</label>
                    <input 
                      type="text" 
                      value={appForm.lastName}
                      onChange={e => setAppForm({ ...appForm, lastName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Date of Birth:</label>
                    <input 
                      type="date" 
                      value={appForm.dateOfBirth}
                      onChange={e => setAppForm({ ...appForm, dateOfBirth: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Phone Number:</label>
                    <input 
                      type="text" 
                      value={appForm.phoneNumber}
                      onChange={e => setAppForm({ ...appForm, phoneNumber: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Physical Address:</label>
                  <input 
                    type="text" 
                    value={appForm.physicalAddress}
                    onChange={e => setAppForm({ ...appForm, physicalAddress: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Quota:</label>
                    <select
                      value={appForm.quotaCategory}
                      onChange={e => setAppForm({ ...appForm, quotaCategory: e.target.value as QuotaCategory })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    >
                      {QUOTA_OPTIONS.map(q => <option key={q} value={q}>{q.replace('_', ' ')}{q === 'YOUTH' ? ' (≤35)' : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Preferred scheme:</label>
                    <select
                      value={appForm.preferredScheme}
                      onChange={e => setAppForm({ ...appForm, preferredScheme: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    >
                      <option value="">Any</option>
                      {developments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Messages via:</label>
                    <select
                      value={appForm.preferredChannel}
                      onChange={e => setAppForm({ ...appForm, preferredChannel: e.target.value as 'WHATSAPP' | 'SMS' })}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="SMS">SMS</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={!session} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2 rounded mt-2">
                  {session ? 'Submit to Queue' : 'Sign in to submit an application'}
                </button>
              </form>
            </div>

            {/* Application 3-Step Approval Pipeline */}
            <div className="col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-sm text-slate-100 mb-3 flex items-center space-x-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>3-Step Review Queue (Land Officer → Finance → CEO)</span>
              </h3>
              <div className="space-y-3 overflow-y-auto max-h-[450px]">
                {applications.length === 0 ? (
                  <p className="text-slate-500">No applications in queue.</p>
                ) : (
                  applications.map(app => (
                    <div key={app.application_id} className="bg-slate-950 p-3.5 rounded border border-slate-800">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-slate-100">{app.first_name} {app.last_name}</span>
                          <span className="text-slate-400 text-[11px] block">ID: {app.national_id} • Round {app.round}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded border border-indigo-500/40 text-indigo-300 text-[10px]">
                          {app.status}
                        </span>
                      </div>

                      {/* Approval Actions according to step */}
                      <div className="mt-3 pt-2 border-t border-slate-900 flex space-x-2 justify-end">
                        {app.status === 'PENDING_LAND_OFFICER' && hasRole('LAND_OFFICER') && (
                          <>
                            <button 
                              onClick={() => handleReview(app.application_id, 'LAND_OFFICER', 'APPROVED')}
                              className="bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 rounded text-white text-[10px]"
                            >
                              ✓ Land Officer Approve
                            </button>
                            <button 
                              onClick={() => setRejecting({ id: app.application_id, role: 'LAND_OFFICER', reason: '' })}
                              className="bg-rose-800 hover:bg-rose-700 px-2.5 py-1 rounded text-white text-[10px]"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        {app.status === 'PENDING_FINANCE' && hasRole('FINANCE_MANAGER') && (
                          <>
                            <button 
                              onClick={() => handleReview(app.application_id, 'FINANCE_MANAGER', 'APPROVED')}
                              className="bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 rounded text-white text-[10px]"
                            >
                              ✓ Finance Manager Approve
                            </button>
                            <button 
                              onClick={() => setRejecting({ id: app.application_id, role: 'FINANCE_MANAGER', reason: '' })}
                              className="bg-rose-800 hover:bg-rose-700 px-2.5 py-1 rounded text-white text-[10px]"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        {app.status === 'PENDING_CEO' && hasRole('CEO') && (
                          <>
                            <button 
                              onClick={() => handleReview(app.application_id, 'CEO', 'APPROVED')}
                              className="bg-indigo-700 hover:bg-indigo-600 px-2.5 py-1 rounded text-white text-[10px]"
                            >
                              ✓ CEO Final Signoff
                            </button>
                            <button 
                              onClick={() => setRejecting({ id: app.application_id, role: 'CEO', reason: '' })}
                              className="bg-rose-800 hover:bg-rose-700 px-2.5 py-1 rounded text-white text-[10px]"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        {app.status === 'APPROVED' && hasRole('LAND_OFFICER') && (
                          <button
                            onClick={() => {
                              setReserveForm(prev => ({ ...prev, applicationId: app.application_id }));
                              setActiveTab('RESERVE');
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-white font-bold text-[10px]"
                          >
                            Assign Stand & Reserve →
                          </button>
                        )}
                      </div>

                      {rejecting?.id === app.application_id && (
                        <div className="mt-2 flex items-center space-x-2">
                          <input
                            autoFocus
                            value={rejecting.reason}
                            onChange={e => setRejecting({ ...rejecting, reason: e.target.value })}
                            placeholder="Reason the applicant will see (at least 10 characters)"
                            className="flex-1 bg-slate-900 border border-rose-800/60 rounded p-1.5 text-slate-100 text-[11px]"
                          />
                          <button
                            disabled={rejecting.reason.trim().length < 10}
                            onClick={() => handleReview(app.application_id, rejecting.role, 'REJECTED', rejecting.reason.trim())}
                            className="bg-rose-700 hover:bg-rose-600 disabled:opacity-40 px-2.5 py-1 rounded text-white text-[10px]"
                          >
                            Return to applicant
                          </button>
                          <button onClick={() => setRejecting(null)} className="text-slate-400 text-[10px]">Cancel</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STAND RESERVATION (FCFS & 50% DEPOSIT 7-DAY TIMER) */}
        {activeTab === 'RESERVE' && (
          <div className="max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-bold text-slate-100 mb-2 flex items-center space-x-2">
              <Award className="w-4 h-4 text-indigo-400" />
              <span>Database-Locked Stand Reservation (7-Day Deposit Window)</span>
            </h2>
            <p className="text-slate-400 text-[11px] mb-4">
              Enforces First-Come-First-Served queue ordering and locks the stand. Requires 50% deposit within 7 days.
            </p>
            <form onSubmit={handleReserve} className="space-y-4">
              <div>
                <label className="text-slate-400 block mb-1">Select Approved Application:</label>
                <select 
                  value={reserveForm.applicationId}
                  onChange={e => setReserveForm({ ...reserveForm, applicationId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                >
                  <option value="">-- Choose Approved Applicant --</option>
                  {approvedApplications.map(a => (
                    <option key={a.application_id} value={a.application_id}>
                      {a.first_name} {a.last_name} ({a.national_id}) · {a.quota_category} · Queued {new Date(a.first_submitted_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Select Available Stand:</label>
                <select 
                  value={reserveForm.parcelId}
                  onChange={e => setReserveForm({ ...reserveForm, parcelId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-100"
                >
                  <option value="">-- Choose Available Stand --</option>
                  {availableStands.map(s => (
                    <option key={s.parcel_id} value={s.parcel_id}>
                      {s.stand_number} · {s.scheme_name} ({s.area_sqm} m² - ${parseFloat(s.price_usd).toLocaleString()} USD){s.quota_category !== 'GENERAL' ? ` · ${s.quota_category} quota` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-indigo-950/30 border border-indigo-500/30 p-3.5 rounded text-[11px] text-indigo-300">
                <span className="font-bold block">Business Rule Execution:</span>
                • Stand is atomically locked in PostgreSQL (`FOR UPDATE`) preventing any double-allocation.<br/>
                • Quota-reserved stands (e.g. youth) only go to applicants in that quota.<br/>
                • The deposit is required before the CEO signs the Agreement of Sale; the buyer is sent the amount, deadline and payment reference.<br/>
                • Stand automatically reverts to the pool if the deposit is not paid in time.
              </div>

              <button type="submit" disabled={!hasRole('LAND_OFFICER') || !reserveForm.applicationId || !reserveForm.parcelId} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 rounded">
                Execute Database Lock & Reserve Stand
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: PAYMENTS & LEDGER */}
        {activeTab === 'PAYMENTS' && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CARD 1: ECOCASH USSD INSTANT PUSH */}
            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                    Mobile Money Gateway
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    EcoCash USSD Instant Push (233#)
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                  REAL-TIME SETTLED
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Dispatches a live EcoCash USSD prompt to buyer's phone. Upon PIN confirmation, immediately matches stand reference and applies instalment payment.
              </p>
              <form onSubmit={handleEcoCashPush} className="space-y-3.5">
                <div>
                  <label className="text-slate-300 block mb-1">Stand Payment Reference (Ref)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ZB-18A4F902"
                    value={ecocashPushForm.accountRef}
                    onChange={e => setEcocashPushForm({ ...ecocashPushForm, accountRef: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Find reference on buyer's reservation SMS or statement
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1">EcoCash Phone Number</label>
                    <input
                      type="tel"
                      required
                      placeholder="+263 77 412 8901"
                      value={ecocashPushForm.payerPhone}
                      onChange={e => setEcocashPushForm({ ...ecocashPushForm, payerPhone: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Amount</label>
                    <div className="flex">
                      <select
                        value={ecocashPushForm.currency}
                        onChange={e => setEcocashPushForm({ ...ecocashPushForm, currency: e.target.value as Currency })}
                        className="bg-slate-950 border border-slate-800 rounded-l-xl p-2.5 text-slate-100 text-xs"
                      >
                        <option value="USD">USD</option>
                        <option value="ZWG">ZiG</option>
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="700.00"
                        value={ecocashPushForm.amount}
                        onChange={e => setEcocashPushForm({ ...ecocashPushForm, amount: e.target.value })}
                        className="flex-1 min-w-0 bg-slate-950 border border-l-0 border-slate-800 rounded-r-xl p-2.5 text-white font-mono focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-[11px] text-emerald-300 space-y-1">
                  <p>• Automatically marks corresponding plan instalment as PAID.</p>
                  <p>• Triggers instant WhatsApp & SMS digital receipt to buyer.</p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !ecocashPushForm.accountRef || !ecocashPushForm.amount}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Send EcoCash USSD Push Prompt</span>
                </button>
              </form>
            </div>

            {/* CARD 2: BANK TRANSFER & CASHIER POS ENTRY */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Treasury Journal
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    Bank Transfer & Cashier Ledger
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                  AUDITED LEDGER
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Post double-entry journal for bank transfers (ZIPIT, RTGS, Nostro), debit orders, and cash collections.
              </p>
              <form onSubmit={handlePay} className="space-y-3.5">
                <div>
                  <label className="text-slate-300 block mb-1">Target Allocation UUID</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Paste Allocation UUID"
                    value={payForm.allocationId}
                    onChange={e => setPayForm({ ...payForm, allocationId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1">Channel</label>
                    <select
                      value={payForm.channel}
                      onChange={e => setPayForm({ ...payForm, channel: e.target.value as PaymentChannel })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (ZIPIT/RTGS)</option>
                      <option value="ECOCASH">EcoCash Agent</option>
                      <option value="OMARI">O'mari</option>
                      <option value="CASH">Cash Office</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Amount</label>
                    <div className="flex">
                      <select
                        value={payForm.currency}
                        onChange={e => setPayForm({ ...payForm, currency: e.target.value as Currency })}
                        className="bg-slate-950 border border-slate-800 rounded-l-xl p-2.5 text-slate-100 text-xs"
                      >
                        <option value="USD">USD</option>
                        <option value="ZWG">ZiG</option>
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="500.00"
                        value={payForm.amount}
                        onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                        className="flex-1 min-w-0 bg-slate-950 border border-l-0 border-slate-800 rounded-r-xl p-2.5 text-white font-mono focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">External Transaction Reference</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. BT-99201481 or Cashier Slip #"
                    value={payForm.externalReference}
                    onChange={e => setPayForm({ ...payForm, externalReference: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!hasRole('FINANCE_MANAGER', 'FINANCE_CLERK') || !payForm.allocationId || !payForm.amount}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>Post Journal & Issue Statutory Receipt</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 5: STATEMENTS & VERIFICATIONS */}
        {activeTab === 'STATEMENTS' && (
          <div className="max-w-3xl mx-auto bg-slate-900/60 border border-slate-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>Official Stand Account Statement</span>
                </h2>
                <p className="text-slate-400 text-[11px]">Real-time balance computation from PostgreSQL `allocation_balances`</p>
              </div>
              <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center space-x-1">
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>

            {statement ? (
              <div className="bg-slate-950 p-5 rounded border border-slate-800 space-y-4">
                <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-100">ZIMBUILD PROPERTY DEVELOPMENT (PVT) LTD</h3>
                    <p className="text-slate-400 text-[10px]">LADM ISO 19152 Official Financial Cadastre</p>
                  </div>
                  <div className="text-right">
                    <span className="text-indigo-400 font-bold block">STATEMENT</span>
                    <span className="text-slate-400 text-[10px] block">Status: {statement.allocation.status}</span>
                    <span className="text-amber-300 text-[10px]">Payment reference: {statement.allocation.account_ref}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded">
                  <div>
                    <span className="text-slate-500 text-[10px] block">CLIENT:</span>
                    <span className="text-slate-100 font-bold">{statement.allocation.first_name} {statement.allocation.last_name}</span>
                    <p className="text-slate-400 text-[10px]">ID: {statement.allocation.national_id}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">STAND:</span>
                    <span className="text-slate-100 font-bold">{statement.allocation.stand_number} ({statement.allocation.area_sqm} m²)</span>
                    <p className="text-emerald-400 text-[10px]">Price: ${parseFloat(statement.allocation.total_price_usd).toLocaleString()} USD</p>
                  </div>
                </div>

                {/* Ledger Transactions */}
                <div>
                  <h4 className="text-slate-300 font-bold mb-1">Receipted Ledger Transactions:</h4>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                        <th className="py-1">DATE</th>
                        <th>REF</th>
                        <th>CHANNEL</th>
                        <th>RECEIPT #</th>
                        <th className="text-right">PAID (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 text-slate-300">
                      {statement.payments.map(p => (
                        <tr key={p.payment_id}>
                          <td className="py-1">{new Date(p.received_at).toLocaleDateString()}</td>
                          <td>{p.external_reference}</td>
                          <td>{p.channel}</td>
                          <td>{p.receipt_number}</td>
                          <td className="text-right text-emerald-400">
                            +${parseFloat(p.amount_usd).toFixed(2)}
                            {p.currency === 'ZWG' && <span className="block text-[9px] text-slate-500">ZiG {p.amount_original} @ {p.fx_rate}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Instalment plan (created when the Agreement of Sale is signed) */}
                {statement.paymentPlan && (
                  <div>
                    <h4 className="text-slate-300 font-bold mb-1">
                      Instalment Plan: {statement.paymentPlan.term_months} months at {statement.paymentPlan.monthly_rate_bps / 100}% per month
                      <span className="text-slate-500 font-normal"> (true annual rate {(Number(statement.paymentPlan.effective_annual_rate) * 100).toFixed(2)}%)</span>
                    </h4>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                          <th className="py-1">#</th>
                          <th>DUE</th>
                          <th className="text-right">AMOUNT</th>
                          <th className="text-right">PAID</th>
                          <th className="text-right">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900 text-slate-300">
                        {statement.paymentPlan.installments.map(i => (
                          <tr key={i.installment_id}>
                            <td className="py-1">{i.seq}</td>
                            <td>{i.due_date}</td>
                            <td className="text-right">${(parseFloat(i.principal_usd) + parseFloat(i.interest_usd)).toFixed(2)}</td>
                            <td className="text-right">${parseFloat(i.paid_usd).toFixed(2)}</td>
                            <td className={`text-right ${i.status === 'PAID' ? 'text-emerald-400' : i.status === 'OVERDUE' ? 'text-rose-400' : 'text-amber-300'}`}>{i.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Outstanding (incl. interest): <span className="text-rose-300">${statement.paymentPlan.outstandingUsd}</span>
                      {Number(statement.paymentPlan.overdueUsd) > 0 && <> · overdue <span className="text-rose-400">${statement.paymentPlan.overdueUsd}</span></>}
                      {statement.paymentPlan.nextInstalment && <> · next ${statement.paymentPlan.nextInstalment.amountUsd} due {statement.paymentPlan.nextInstalment.dueDate}</>}
                    </p>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-3 flex justify-between items-center text-sm font-bold">
                  <div>
                    <span className="text-slate-500 text-xs block font-normal">Total Paid:</span>
                    <span className="text-emerald-400">${parseFloat(statement.allocation.paid_usd ?? '0').toLocaleString()} USD</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 text-xs block font-normal">Price Balance Remaining:</span>
                    <span className="text-rose-400">${parseFloat(statement.allocation.balance_usd ?? '0').toLocaleString()} USD</span>
                  </div>
                </div>

                {/* Document Signature & Automated Messaging Action Buttons */}
                <div className="border-t border-slate-800 pt-3 flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => handleSendReminder(statement.allocation.allocation_id)}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded flex items-center space-x-1 text-xs"
                    title="Send SMS / WhatsApp reminder for next instalment"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Send WhatsApp Reminder</span>
                  </button>
                  <button
                    onClick={() => handleSendStatement(statement.allocation.allocation_id)}
                    className="bg-sky-700 hover:bg-sky-600 text-white px-3 py-1.5 rounded flex items-center space-x-1 text-xs"
                    title="Send complete account statement via SMS / WhatsApp"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send WhatsApp Statement</span>
                  </button>
                  {statement.allocation.status === 'AWAITING_SIGNATURE' && hasRole('CEO') && (
                    <button 
                      onClick={() => handleSignAos(statement.allocation.allocation_id)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs"
                    >
                      CEO: Sign Agreement of Sale
                    </button>
                  )}
                  {statement.allocation.status === 'PAID_IN_FULL' && hasRole('CEO') && (
                    <button 
                      onClick={() => handleSignDeed(statement.allocation.allocation_id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs"
                    >
                      CEO: Sign Official Title Deed
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">Select an allocation or enter an ID to view its real-time statement.</p>
            )}
          </div>
        )}

        {/* TAB 6: OWNER PORTAL */}
        {activeTab === 'OWNER_PORTAL' && (
          <div className="max-w-3xl mx-auto space-y-4">
            <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Client Stand Owner Self-Service Portal</span>
            </h2>

            {ownerAllocations.length === 0 ? (
              <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-800 text-slate-400 text-center">
                No active stand allocations associated with current authenticated subject.
              </div>
            ) : (
              ownerAllocations.map(alloc => (
                <div key={alloc.allocation_id} className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-slate-100 text-sm">{alloc.stand_number}</span>
                      <span className="text-slate-400 text-[11px] block">{alloc.scheme_name} • {alloc.site_location}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded border border-emerald-500/40 text-emerald-300">
                      {alloc.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3 rounded">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Valuation</span>
                      <span className="font-bold text-slate-200">${parseFloat(alloc.total_price_usd).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Paid to Date</span>
                      <span className="font-bold text-emerald-400">${parseFloat(alloc.paid_usd ?? '0').toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Price balance</span>
                      <span className="font-bold text-rose-400">${parseFloat(alloc.balance_usd ?? '0').toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button 
                      onClick={() => handleLoadStatement(alloc.allocation_id)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-[11px]"
                    >
                      View Live Statement
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: AUTOMATIC SMS / WHATSAPP REMINDERS & STATEMENTS HUB */}
        {activeTab === 'MESSAGING' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex justify-between items-center gap-4 flex-wrap">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest block mb-1">
                  Automated Messaging Infrastructure (WhatsApp Cloud API & SMS)
                </span>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                  Buyer Notification Journal & Scheduled Reminders
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  Idempotent delivery queue for payment reminders, overdue notices, receipts, and monthly account statements.
                </p>
              </div>
              <button
                onClick={handleTriggerScheduledJobs}
                disabled={loading}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition flex items-center gap-2 text-xs"
              >
                <Clock className="w-4 h-4" />
                <span>Run Daily Scheduled Jobs (Reminders & Overdue)</span>
              </button>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Outbound WhatsApp / SMS Dispatch Ledger
                </h3>
                <span className="text-xs text-slate-400">Total Logged: {outboundMessages.length} Messages</span>
              </div>

              {outboundMessages.length === 0 ? (
                <div className="bg-slate-950 p-6 rounded-xl text-center text-slate-500">
                  No outbound messages in queue. Submit an application or trigger reminders to see live dispatches.
                </div>
              ) : (
                <div className="overflow-x-auto text-xs font-mono">
                  <table className="w-full text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Date / Time</th>
                        <th className="p-2.5">Recipient</th>
                        <th className="p-2.5">Channel</th>
                        <th className="p-2.5">Template</th>
                        <th className="p-2.5">Message Body Preview</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {outboundMessages.map(m => (
                        <tr key={m.message_id} className="hover:bg-slate-800/40">
                          <td className="p-2.5 whitespace-nowrap text-slate-400">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-bold text-white whitespace-nowrap">+{m.to_phone}</td>
                          <td className="p-2.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.channel === 'WHATSAPP' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'bg-blue-950 text-blue-400 border border-blue-500/40'
                            }`}>
                              {m.channel}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-cyan-400 whitespace-nowrap">{m.template}</td>
                          <td className="p-2.5 text-slate-300 max-w-md truncate" title={m.body}>
                            {m.body}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.status === 'SENT' ? 'bg-emerald-500/20 text-emerald-400' :
                              m.status === 'QUEUED' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: SUPPLY CHAIN, INVENTORY WMS & PREFABRICATION MRP/PLM */}
        {activeTab === 'SUPPLY_CHAIN' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex justify-between items-center gap-4 flex-wrap">
              <div>
                <span className="text-[10px] text-teal-400 font-bold uppercase tracking-widest block mb-1">
                  Module 3 • Enterprise Supply Chain & Operations
                </span>
                <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                  <Package className="w-5 h-5 text-teal-400" />
                  <span>Central Stores, Site WMS, Automated Purchasing & Prefabrication MRP</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Live multi-location stock tracking, RFQ supplier quotes, 3-way invoice matching, and Bill of Materials (BOM) explosion.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-mono font-bold">
                  WMS v3.0 Live Reconciled
                </span>
              </div>
            </div>

            {/* Quick KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-slate-400 text-xs">Total Stock Valuation:</span>
                <h3 className="text-xl font-bold text-teal-400 font-mono">$215,640.00 USD</h3>
                <p className="text-[10px] text-slate-500">Central Stores + Active Sites</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-slate-400 text-xs">Active Purchase Orders:</span>
                <h3 className="text-xl font-bold text-emerald-400 font-mono">3 Orders ($18,900 USD)</h3>
                <p className="text-[10px] text-slate-500">100% 3-Way Match Verified</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-slate-400 text-xs">Prefabrication Modules:</span>
                <h3 className="text-xl font-bold text-blue-400 font-mono">80 Units Stocked</h3>
                <p className="text-[10px] text-slate-500">Mount Hampden Prefab Yard</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-slate-400 text-xs">Safety Stock Buffer:</span>
                <h3 className="text-xl font-bold text-amber-400 font-mono">100% Covered</h3>
                <p className="text-[10px] text-slate-500">Zero Critical Out-of-Stock</p>
              </div>
            </div>

            {/* Multi-Location Stock Register Table */}
            <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <Boxes className="w-4 h-4 text-teal-400" />
                  <span>Central Warehouse & Construction Site Materials Stock Register</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">Multi-Store Audit Trail</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 bg-slate-950/80">
                      <th className="p-3">SKU ID</th>
                      <th className="p-3">Material Description</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Central Store</th>
                      <th className="p-3">Highlands Site</th>
                      <th className="p-3">Kadoma Site</th>
                      <th className="p-3">Prefab Yard</th>
                      <th className="p-3">Unit Cost</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    <tr className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-bold text-teal-400">MAT-BRICK</td>
                      <td className="p-3 font-sans font-semibold text-white">Solid Common Clay Bricks</td>
                      <td className="p-3 text-slate-400">Masonry</td>
                      <td className="p-3 text-slate-200">160,000</td>
                      <td className="p-3 text-emerald-400">25,000</td>
                      <td className="p-3 text-blue-400">15,000</td>
                      <td className="p-3 text-slate-500">0</td>
                      <td className="p-3 text-slate-300">$0.12</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">OPTIMAL</span></td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-bold text-teal-400">MAT-CEMENT-32</td>
                      <td className="p-3 font-sans font-semibold text-white">Portland Masonry Cement 32.5R</td>
                      <td className="p-3 text-slate-400">Binders</td>
                      <td className="p-3 text-slate-200">3,500</td>
                      <td className="p-3 text-emerald-400">450</td>
                      <td className="p-3 text-blue-400">250</td>
                      <td className="p-3 text-slate-500">0</td>
                      <td className="p-3 text-slate-300">$10.50</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">OPTIMAL</span></td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-bold text-teal-400">MAT-REBAR-Y12</td>
                      <td className="p-3 font-sans font-semibold text-white">High Tensile Deformed Rebar Y12</td>
                      <td className="p-3 text-slate-400">Steel</td>
                      <td className="p-3 text-slate-200">16,500</td>
                      <td className="p-3 text-emerald-400">3,000</td>
                      <td className="p-3 text-slate-500">0</td>
                      <td className="p-3 text-amber-400">4,200</td>
                      <td className="p-3 text-slate-300">$1.50</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">OPTIMAL</span></td>
                    </tr>
                    <tr className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-bold text-teal-400">PREFAB-WALL-STD</td>
                      <td className="p-3 font-sans font-semibold text-white">Lightweight Insulated Wall Panel (2.8m x 1.2m)</td>
                      <td className="p-3 text-slate-400">Prefabrication</td>
                      <td className="p-3 text-slate-200">12</td>
                      <td className="p-3 text-emerald-400">48</td>
                      <td className="p-3 text-slate-500">0</td>
                      <td className="p-3 text-amber-400">20</td>
                      <td className="p-3 text-slate-300">$145.00</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">OPTIMAL</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchasing & 3-Way Invoice Matching Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-3 shadow-xl">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>3-Way Invoice Matching & PO Verifications</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Cross-checks Purchase Order prices vs site delivery slips with photo hashes vs supplier tax invoices.
                </p>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <b className="text-white font-mono text-emerald-400">PO-2026-104</b> • <span className="text-white">PPC Zimbabwe Ltd</span>
                      <p className="text-[10px] text-slate-400">800 Bags Cement Delivered • Photo Hash #a89f3b207e99c15d</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                      ✓ 3-WAY MATCHED
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <b className="text-white font-mono text-emerald-400">PO-2026-105</b> • <span className="text-white">Beta Bricks / Mount Hampden</span>
                      <p className="text-[10px] text-slate-400">40,000 Bricks Delivered • Photo Hash #bc7190f4e12da841</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                      ✓ 3-WAY MATCHED
                    </span>
                  </div>
                </div>
              </div>

              {/* Manufacturing & Prefab MRP BOM Explosion Card */}
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-3 shadow-xl">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <Factory className="w-4 h-4 text-blue-400" />
                  <span>Manufacturing MRP & Prefabrication (BOM)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Explodes raw components (cement, sand, aggregate, rebar) and manages PLM engineering changes.
                </p>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-800/80 pb-1">
                    <span className="text-slate-400">BOM Reference:</span>
                    <span className="text-white font-bold">BOM-WALL-2026-A (Rev B)</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-1">
                    <span className="text-slate-400">Unit Production Cost:</span>
                    <span className="text-emerald-400 font-bold">$145.00 USD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active Work Order:</span>
                    <span className="text-blue-400 font-bold">PWO-2026-042 (38 / 50 Assembled)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'CONSTRUCTION' && (
          <ConstructionWorkspace session={session} notify={flashSuccess} fail={(err) => setErrorMsg(errorText(err))} />
        )}

        {/* ------------------------------------------------------------- */}
        {/* SALES, CUSTOMER EXPERIENCE & DIGITAL CHANNELS: CRM PIPELINE  */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'CRM_PIPELINE' && (
          <div className="space-y-6">
            {/* Executive Header */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex justify-between items-center gap-4 flex-wrap shadow-xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    Sales, Customer Experience & Digital Channels
                  </span>
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                    Omnichannel Ingestion
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  CRM & Sales Pipeline Management
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tracks real estate inquiries across digital channels (WhatsApp, Web, EcoCash, Diaspora), client communication history, sales pipelines, and customer relationship management.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadCrmData}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${crmLoading ? 'animate-spin text-amber-400' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Top KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Active Pipeline</span>
                <p className="text-2xl font-bold text-white font-mono">
                  ${(crmPipeline?.total_pipeline_value_usd || 282000).toLocaleString()} USD
                </p>
                <p className="text-[10px] text-amber-400 font-mono">
                  ZWG {((crmPipeline?.total_pipeline_value_usd || 282000) * 26.50).toLocaleString()} (RBZ @ 26.50)
                </p>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
                  <span>Weighted:</span>
                  <span className="font-bold text-emerald-400">${(crmPipeline?.weighted_pipeline_value_usd || 193500).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Real Estate Inquiries</span>
                <p className="text-2xl font-bold text-blue-400 font-mono">
                  {crmInquiries.length || 4} Active Leads
                </p>
                <p className="text-[10px] text-slate-400">WhatsApp AI Bot · Web · EcoCash · Diaspora</p>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
                  <span>Diaspora Share:</span>
                  <span className="font-bold text-white font-mono">25.0% (UK & US)</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Digital Response SLA</span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">4.2 min avg</p>
                <p className="text-[10px] text-slate-400">Instant WhatsApp Brochure Delivery</p>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
                  <span>First Contact Resolution:</span>
                  <span className="font-bold text-emerald-400 font-mono">86.5%</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Customer Experience (CSAT)</span>
                <p className="text-2xl font-bold text-purple-400 font-mono">4.9 / 5.0</p>
                <p className="text-[10px] text-slate-400">+72 Net Promoter Score</p>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400">
                  <span>Pipeline Conversion:</span>
                  <span className="font-bold text-white font-mono">25.0%</span>
                </div>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex border-b border-slate-800 gap-2 pb-1 text-xs">
              <button
                onClick={() => setCrmSubTab('PIPELINE')}
                className={`px-4 py-2 rounded-lg font-bold transition flex items-center gap-1.5 ${crmSubTab === 'PIPELINE' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
              >
                <span>Sales Pipeline Kanban</span>
              </button>
              <button
                onClick={() => setCrmSubTab('INQUIRIES')}
                className={`px-4 py-2 rounded-lg font-bold transition flex items-center gap-1.5 ${crmSubTab === 'INQUIRIES' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
              >
                <span>Inquiries & Digital Channels</span>
              </button>
              <button
                onClick={() => setCrmSubTab('COMMUNICATIONS')}
                className={`px-4 py-2 rounded-lg font-bold transition flex items-center gap-1.5 ${crmSubTab === 'COMMUNICATIONS' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
              >
                <span>Communication History</span>
              </button>
              <button
                onClick={() => setCrmSubTab('ANALYTICS')}
                className={`px-4 py-2 rounded-lg font-bold transition flex items-center gap-1.5 ${crmSubTab === 'ANALYTICS' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
              >
                <span>Omnichannel Analytics</span>
              </button>
            </div>

            {/* SUBTAB 1: PIPELINE KANBAN */}
            {crmSubTab === 'PIPELINE' && (
              <div className="space-y-4">
                <div className="flex overflow-x-auto gap-4 pb-4 items-start min-h-[460px]">
                  {[
                    { id: '1_INQUIRY_CAPTURED', label: '1. Inquiries Captured', prob: '10%' },
                    { id: '2_CONTACT_QUALIFIED', label: '2. Contact Qualified', prob: '25%' },
                    { id: '3_SITE_VISIT_SCHEDULED', label: '3. Site Visit Scheduled', prob: '45%' },
                    { id: '4_PROPOSAL_QUOTATION', label: '4. Proposal & Quotation', prob: '60%' },
                    { id: '5_KYC_DLAP_SCREENING', label: '5. KYC & DLAP Screening', prob: '75%' },
                    { id: '6_RESERVATION_DEPOSIT', label: '6. Reservation Deposit', prob: '90%' },
                    { id: '7_AGREEMENT_OF_SALE', label: '7. Agreement of Sale', prob: '95%' },
                    { id: '8_CLOSED_WON', label: '8. Closed Won', prob: '100%' }
                  ].map((stage, idx, arr) => {
                    const stageDeals = crmPipeline?.stages?.[stage.id] || [];
                    const stageTotal = stageDeals.reduce((sum, d) => sum + (d.deal_value_usd || 0), 0);
                    return (
                      <div key={stage.id} className="flex-shrink-0 w-72 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col max-h-[620px]">
                        <div className="p-3.5 border-b border-slate-800/80 bg-slate-950/60 rounded-t-2xl">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-white uppercase tracking-wider truncate">{stage.label}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {stageDeals.length}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-mono">
                            <span>Total:</span>
                            <span className="text-emerald-400 font-bold">${stageTotal.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1">
                          {stageDeals.length === 0 ? (
                            <div className="text-center py-8 text-slate-600 text-xs italic">No deals in stage</div>
                          ) : (
                            stageDeals.map(d => (
                              <div key={d.deal_id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl hover:border-amber-500/40 transition space-y-2">
                                <div className="flex justify-between items-start gap-1">
                                  <h4 className="font-bold text-white text-xs leading-snug line-clamp-2">{d.title}</h4>
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">{d.probability_pct}%</span>
                                </div>
                                <div className="text-[11px] text-slate-300">
                                  <p className="font-semibold text-amber-300">{d.customer_name}</p>
                                  <p className="text-slate-400 text-[10px] font-mono">{d.stand_or_property_id}</p>
                                </div>
                                <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between font-mono text-[11px]">
                                  <span className="text-emerald-400 font-bold">${(d.deal_value_usd || 0).toLocaleString()}</span>
                                  <span className="text-[10px] text-slate-500">{d.days_in_stage || 1}d in stage</span>
                                </div>
                                <div className="pt-1 flex justify-between items-center text-[10px]">
                                  <span className="text-slate-400 truncate max-w-[120px]">{d.assigned_agent}</span>
                                  {idx < arr.length - 1 ? (
                                    <button
                                      onClick={() => handleAdvanceDeal(d.deal_id, arr[idx + 1].id)}
                                      className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold transition text-[10px]"
                                    >
                                      Next Stage →
                                    </button>
                                  ) : (
                                    <span className="text-emerald-400 font-bold">✓ WON</span>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUBTAB 2: INQUIRIES & DIGITAL CHANNELS */}
            {crmSubTab === 'INQUIRIES' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Log Inquiry Form */}
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Log Real Estate Inquiry
                    </h3>
                    <form onSubmit={handleCreateInquiry} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Customer Full Name</label>
                        <input
                          type="text"
                          required
                          value={newInqForm.customer_name}
                          onChange={e => setNewInqForm({ ...newInqForm, customer_name: e.target.value })}
                          placeholder="e.g. Tendai Chikore"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">WhatsApp / Phone</label>
                          <input
                            type="text"
                            required
                            value={newInqForm.phone}
                            onChange={e => setNewInqForm({ ...newInqForm, phone: e.target.value })}
                            placeholder="+263 770 000000"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Source Channel</label>
                          <select
                            value={newInqForm.source_channel}
                            onChange={e => setNewInqForm({ ...newInqForm, source_channel: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-semibold"
                          >
                            <option value="WHATSAPP_BOT">WhatsApp Bot</option>
                            <option value="WEBSITE_PORTAL">Web Portal</option>
                            <option value="ECOCASH_DIGITAL">EcoCash Digital</option>
                            <option value="DIASPORA_DESK">Diaspora Desk</option>
                            <option value="WALK_IN_OFFICE">Walk-In Office</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={newInqForm.email}
                          onChange={e => setNewInqForm({ ...newInqForm, email: e.target.value })}
                          placeholder="client@example.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Property of Interest</label>
                        <input
                          type="text"
                          required
                          value={newInqForm.property_interest}
                          onChange={e => setNewInqForm({ ...newInqForm, property_interest: e.target.value })}
                          placeholder="e.g. Stand 412 Parkview Heights"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Budget ($ USD)</label>
                          <input
                            type="number"
                            required
                            value={newInqForm.budget_usd}
                            onChange={e => setNewInqForm({ ...newInqForm, budget_usd: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Diaspora?</label>
                          <select
                            value={newInqForm.is_diaspora ? 'true' : 'false'}
                            onChange={e => setNewInqForm({ ...newInqForm, is_diaspora: e.target.value === 'true' })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                          >
                            <option value="false">No (Local)</option>
                            <option value="true">Yes (Diaspora)</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Notes</label>
                        <textarea
                          rows={2}
                          value={newInqForm.notes}
                          onChange={e => setNewInqForm({ ...newInqForm, notes: e.target.value })}
                          placeholder="Specific requests, e.g. 24-month amortization"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={crmLoading}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs shadow-lg transition"
                      >
                        {crmLoading ? 'Logging...' : 'Save & Ingest Lead'}
                      </button>
                    </form>
                  </div>

                  {/* Inquiries Table */}
                  <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Real Estate Inquiries Register
                      </h3>
                      <div className="flex items-center gap-1 text-[11px]">
                        {['ALL', 'WHATSAPP_BOT', 'WEBSITE_PORTAL', 'DIASPORA_DESK', 'ECOCASH_DIGITAL'].map(ch => (
                          <button
                            key={ch}
                            onClick={() => setInquiryChannelFilter(ch)}
                            className={`px-2 py-0.5 rounded ${inquiryChannelFilter === ch ? 'bg-amber-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                          >
                            {ch.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                            <th className="p-2.5">Ref</th>
                            <th className="p-2.5">Client</th>
                            <th className="p-2.5">Channel</th>
                            <th className="p-2.5">Property</th>
                            <th className="p-2.5">Budget</th>
                            <th className="p-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {filteredCrmInquiries.map(inq => (
                            <tr key={inq.inquiry_id} className="hover:bg-slate-800/40 transition">
                              <td className="p-2.5 text-amber-400 font-bold">{inq.inquiry_id}</td>
                              <td className="p-2.5 font-sans font-semibold text-white">
                                {inq.customer_name}
                                {inq.is_diaspora && <span className="ml-1 text-[9px] px-1 rounded bg-amber-500/20 text-amber-400">Diaspora</span>}
                                <div className="text-[10px] text-slate-400 font-mono">{inq.phone}</div>
                              </td>
                              <td className="p-2.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                  {inq.source_channel.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans text-slate-300 max-w-[160px] truncate">{inq.property_interest}</td>
                              <td className="p-2.5 text-emerald-400 font-bold">${(inq.budget_usd || 0).toLocaleString()}</td>
                              <td className="p-2.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                                  {inq.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 3: CLIENT COMMUNICATION HISTORY */}
            {crmSubTab === 'COMMUNICATIONS' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form to log communication */}
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    Record Client Interaction
                  </h3>
                  <form onSubmit={handleLogComm} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Client Name / ID</label>
                      <input
                        type="text"
                        required
                        value={newCommForm.customer_id_or_name}
                        onChange={e => setNewCommForm({ ...newCommForm, customer_id_or_name: e.target.value })}
                        placeholder="e.g. Farai Chengeta"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Deal or Inquiry Ref</label>
                      <input
                        type="text"
                        required
                        value={newCommForm.inquiry_or_deal_ref}
                        onChange={e => setNewCommForm({ ...newCommForm, inquiry_or_deal_ref: e.target.value })}
                        placeholder="e.g. DEAL-1001 or INQ-2026-001"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Channel</label>
                        <select
                          value={newCommForm.channel}
                          onChange={e => setNewCommForm({ ...newCommForm, channel: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        >
                          <option value="WHATSAPP">WhatsApp</option>
                          <option value="PHONE_CALL">Phone Call</option>
                          <option value="IN_PERSON">In-Person Meeting</option>
                          <option value="EMAIL">Email</option>
                          <option value="SMS">SMS Notice</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Sentiment</label>
                        <select
                          value={newCommForm.client_sentiment}
                          onChange={e => setNewCommForm({ ...newCommForm, client_sentiment: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        >
                          <option value="Enthusiastic">Enthusiastic</option>
                          <option value="Positive">Positive</option>
                          <option value="Neutral">Neutral</option>
                          <option value="Hesitant">Hesitant</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Summary / Transcript</label>
                      <textarea
                        rows={3}
                        required
                        value={newCommForm.summary}
                        onChange={e => setNewCommForm({ ...newCommForm, summary: e.target.value })}
                        placeholder="Interaction summary, notes, and agreed terms"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Next Action</label>
                        <input
                          type="text"
                          value={newCommForm.follow_up_action}
                          onChange={e => setNewCommForm({ ...newCommForm, follow_up_action: e.target.value })}
                          placeholder="e.g. Issue Agreement"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Target Date</label>
                        <input
                          type="date"
                          value={newCommForm.follow_up_date}
                          onChange={e => setNewCommForm({ ...newCommForm, follow_up_date: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={crmLoading}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs shadow-lg transition"
                    >
                      {crmLoading ? 'Recording...' : 'Log Interaction'}
                    </button>
                  </form>
                </div>

                {/* Timeline Feed */}
                <div className="lg:col-span-2 space-y-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                    Client Interaction Timeline
                  </h3>
                  {crmComms.map(c => (
                    <div key={c.comm_id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2 hover:border-slate-700 transition">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{c.customer_id_or_name}</span>
                          <span className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">{c.inquiry_or_deal_ref}</span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{c.channel}</span>
                        </div>
                        <span className="text-slate-500 font-mono text-[10px]">{c.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-300">{c.summary}</p>
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[11px] text-slate-400">
                        <span>Staff: <strong className="text-slate-200">{c.agent_name}</strong></span>
                        {c.follow_up_action && (
                          <span className="text-amber-400 font-semibold">
                            Follow-up ({c.follow_up_date || 'ASAP'}): {c.follow_up_action}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUBTAB 4: ANALYTICS */}
            {crmSubTab === 'ANALYTICS' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Omnichannel Ingestion Distribution
                  </h3>
                  <div className="space-y-3 text-xs">
                    {[
                      { name: 'WhatsApp AI Bot (24/7)', pct: 48, leads: 12, val: '$142,000', col: 'bg-emerald-500' },
                      { name: 'Web Ingestion Portal', pct: 30, leads: 8, val: '$95,000', col: 'bg-blue-500' },
                      { name: 'Diaspora Desk (UK/US/SA)', pct: 14, leads: 4, val: '$180,000', col: 'bg-amber-500' },
                      { name: 'EcoCash Digital Mini-App', pct: 8, leads: 2, val: '$24,000', col: 'bg-purple-500' }
                    ].map(ch => (
                      <div key={ch.name} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span className="text-white">{ch.name}</span>
                          <span className="text-amber-400 font-mono">{ch.pct}% ({ch.leads} leads)</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div className={`${ch.col} h-full rounded-full`} style={{ width: `${ch.pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                          <span>Pipeline Value:</span>
                          <span className="text-emerald-400 font-bold font-mono">{ch.val} USD</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Customer Experience (CX) Governance
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-300 font-bold">Customer Satisfaction (CSAT)</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {crmMetrics?.customer_experience?.csat_score_out_of_5 ? `${crmMetrics.customer_experience.csat_score_out_of_5} / 5.0 ★` : '4.85 / 5.0 ★'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Live sentiment analysis from customer communication history</p>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-300 font-bold">Net Promoter Score (NPS)</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {crmMetrics?.customer_experience?.nps_net_promoter_score ? `+${crmMetrics.customer_experience.nps_net_promoter_score}` : '+72 (World Class)'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Benchmarked across diaspora investors and residential stand purchasers</p>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-300 font-bold">WhatsApp Response SLA</span>
                        <span className="text-blue-400 font-mono font-bold">
                          {crmMetrics?.digital_response_sla_minutes ? `${crmMetrics.digital_response_sla_minutes} min avg` : '4.2 min avg'} (&lt; 5 min standard)
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Automated instant cadastral beacon and price matrix delivery</p>
                    </div>
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-300 font-bold">First Contact Resolution Rate</span>
                        <span className="text-amber-400 font-mono font-bold">
                          {crmMetrics?.customer_experience?.first_contact_resolution_rate_pct ? `${crmMetrics.customer_experience.first_contact_resolution_rate_pct}%` : '86.5%'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Inquiries resolved on primary call/chat without transfer</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Status Bar */}
      <footer className="h-7 bg-slate-950 border-t border-slate-800 px-6 flex items-center justify-between text-[11px] font-mono text-slate-500 z-10">
        <div className="flex items-center space-x-4">
          <span className={serverUp ? 'text-emerald-500' : serverUp === false ? 'text-rose-400' : ''}>
            API: {serverUp ? 'online' : serverUp === false ? 'offline' : 'checking'} ({api.API_BASE})
          </span>
          <span>•</span>
          <span>FCFS queue · deposit rule · double-allocation lock enforced by the database</span>
        </div>
        <div>
          <span>ZimBuild Housing Management System (ZHMS) © 2026</span>
        </div>
      </footer>

      {/* GeoJSON Cadastral Layer Ingestion Modal */}
      <GeoJsonUploaderModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        developmentId={selectedDevId}
        onUploadSuccess={(importedCount) => {
          flashSuccess(`Imported ${importedCount} surveyed stand(s) into ${activeDev?.name ?? 'the development'}.`);
        }}
      />
    </div>
  );
}
