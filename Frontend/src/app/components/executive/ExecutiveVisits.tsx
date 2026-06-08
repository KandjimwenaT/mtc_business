import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Input, 
  Select, 
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge
} from "../ui-components";
import { Plus, Calendar, MapPin, CheckCircle, Search, Star, MessageSquare, X, Video, Building2, ChevronLeft, ChevronRight, ChevronDown, Clock, User, Send, AlertTriangle, FileText, Trash2, Navigation, Check } from "lucide-react";
import { getCurrentUser } from "../../api/authApi";
import { createVisit, updateVisit, requestReschedule, submitControlCard, getControlCard, updateControlCard, getDepartmentTeam, recordVisitMeetingStart, openStreetMapMeetingStartLink, type VisitRecord, type VisitPayload, type ControlCardRecord, type DepartmentTeamMember } from "../../api/visitApi";
import { useExecutiveData } from "../../hooks/useExecutiveData";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, startOfMonth, endOfMonth } from "date-fns";

interface VisitHistoryItem {
  date: string;
  corp: string;
  type: string;
  exec: string;
  rating: number;
}

interface AvrActionItemRow {
  /** What the customer needs (creates ticket title / description) */
  item: string;
  quantity: string;
  dueDate: string;
  owner: string;
  notes: string;
  category: "request" | "complaint";
  /** Ticket type slug — must match backend ticketController lists */
  requestType: string;
}

interface AVRData {
  accountName: string;
  visitDate: string;
  csrManager: string;
  customerParticipants: string;
  visitObjective: string;
  slaCompliance: string;
  openTickets: string;
  criticalIncidents: string;
  risksOperational: string;
  risksCommercial: string;
  risksCompetitive: string;
  opportunitiesUpsell: string;
  opportunitiesProcess: string;
  actionItems: AvrActionItemRow[];
}

const emptyActionItem = (): AvrActionItemRow => ({
  item: "",
  quantity: "",
  dueDate: "",
  owner: "",
  notes: "",
  category: "request",
  requestType: "new_product_request",
});

function normalizeActionItem(raw: Partial<AvrActionItemRow> & { action?: string; deadline?: string }): AvrActionItemRow {
  const category = raw.category === "complaint" ? "complaint" : "request";
  const fallbackType = category === "complaint" ? "other" : "new_product_request";
  return {
    item: String(raw.item ?? raw.action ?? "").trim(),
    quantity: String(raw.quantity ?? "").trim(),
    dueDate: String(raw.dueDate ?? raw.deadline ?? "").trim(),
    owner: String(raw.owner ?? "").trim(),
    notes: String(raw.notes ?? "").trim(),
    category,
    requestType: String(raw.requestType ?? "").trim() || fallbackType,
  };
}

const AVR_TICKET_REQUEST_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "new_product_request", label: "New product / equipment" },
  { value: "new_line", label: "New line" },
  { value: "plan_change", label: "Plan change" },
  { value: "line_activation", label: "Line activation" },
  { value: "upgrade", label: "Upgrade" },
  { value: "request_meeting", label: "Request meeting" },
  { value: "other", label: "Other" },
];

const AVR_TICKET_COMPLAINT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "service", label: "Service" },
  { value: "network", label: "Network" },
  { value: "technical", label: "Technical" },
  { value: "billing", label: "Billing" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

type VisitScheduleMode = "single" | "quarterly";
const QUARTERLY_VISIT_COUNT = 4;

/** One visit per month for four months, starting from the first selected date. */
function quarterlyVisitDates(firstVisitDate: string): string[] {
  const base = new Date(`${firstVisitDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  return Array.from({ length: QUARTERLY_VISIT_COUNT }, (_, i) =>
    format(addMonths(base, i), "yyyy-MM-dd"),
  );
}

const defaultAVR = (): AVRData => ({
  accountName: "",
  visitDate: "",
  csrManager: "",
  customerParticipants: "",
  visitObjective: "",
  slaCompliance: "",
  openTickets: "",
  criticalIncidents: "",
  risksOperational: "",
  risksCommercial: "",
  risksCompetitive: "",
  opportunitiesUpsell: "",
  opportunitiesProcess: "",
  actionItems: [emptyActionItem()],
});

function AVRSection({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-mtc-blue text-white text-xs font-bold">{number}</span>
        <h4 className="font-semibold text-slate-800 text-sm">{title}</h4>
      </div>
      <div className="ml-8">{children}</div>
    </div>
  );
}

/** Suggestions for SLA fields — HTML datalist: pick from list or type freely. */
const AVR_SLA_COMPLIANCE_SUGGESTIONS = [
  "≥ 99%",
  "95–98%",
  "90–94%",
  "80–89%",
  "< 80%",
  "Not measured this period",
  "Under review",
] as const;

const AVR_OPEN_TICKETS_SUGGESTIONS = [
  "None (0)",
  "1",
  "2",
  "3–5",
  "6–10",
  "10+",
] as const;

const AVR_CRITICAL_INCIDENTS_SUGGESTIONS = ["None (0)", "1", "2", "3+"] as const;

/** Longer presets for risks / opportunities — applied via quick-select; user can still edit the textarea. */
const AVR_RISK_OPERATIONAL_PRESETS = [
  "No material operational risks identified.",
  "Network performance or latency concerns.",
  "Service delivery or provisioning delays.",
  "SLA breaches in the review period.",
  "Equipment or infrastructure constraints.",
  "Capacity or scalability concerns.",
  "Security or compliance gaps.",
] as const;

const AVR_RISK_COMMERCIAL_PRESETS = [
  "No significant commercial risks identified.",
  "Contract renewal or term pressure.",
  "Budget or cost sensitivity.",
  "Billing or payment disputes.",
  "Churn or retention risk.",
  "Pricing or discount pressure.",
] as const;

const AVR_RISK_COMPETITIVE_PRESETS = [
  "No significant competitive pressure.",
  "Active competitor engagement at this account.",
  "Customer evaluating alternative providers.",
  "Price undercutting in the market.",
  "New market entrant threat.",
] as const;

const AVR_OPPORTUNITY_UPSELL_PRESETS = [
  "Fiber or bandwidth upgrade.",
  "Additional lines or seats.",
  "Cloud or managed services expansion.",
  "Security or backup add-ons.",
  "IoT or mobility solutions.",
  "No upsell opportunity identified.",
] as const;

const AVR_OPPORTUNITY_PROCESS_PRESETS = [
  "Billing or invoicing process improvements.",
  "Ticketing and support workflow.",
  "Reporting and stakeholder communication.",
  "Onboarding and provisioning speed.",
  "Escalation and SLA governance.",
  "No process improvement noted.",
] as const;

function AvrDatalistField({
  id,
  value,
  onChange,
  placeholder,
  suggestions,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestions: readonly string[];
}) {
  return (
    <>
      <Input
        id={id}
        list={`${id}-datalist`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={`${id}-datalist`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function AvrPresetSelect({
  ariaLabel,
  options,
  onSelect,
}: {
  ariaLabel: string;
  options: readonly string[];
  onSelect: (value: string) => void;
}) {
  return (
    <select
      className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600"
      defaultValue=""
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        if (v) onSelect(v);
        e.target.selectedIndex = 0;
      }}
    >
      <option value="">Quick options…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-600", bg: "bg-amber-100 border-l-2 border-amber-500" },
  approved: { label: "Approved", color: "text-blue-600", bg: "bg-blue-100 border-l-2 border-blue-500" },
  confirmed: { label: "Confirmed", color: "text-green-600", bg: "bg-green-100 border-l-2 border-green-500" },
  follow_up_pending: {
    label: "Awaiting AVR closure",
    color: "text-amber-700",
    bg: "bg-amber-100 border-l-2 border-amber-500",
  },
  declined: { label: "Declined", color: "text-red-600", bg: "bg-red-100 border-l-2 border-red-500" },
  completed: { label: "Completed", color: "text-gray-600", bg: "bg-gray-100 border-l-2 border-gray-500" },
  cancelled: { label: "Cancelled", color: "text-gray-400", bg: "bg-gray-50 border-l-2 border-gray-400" },
  rescheduled: { label: "Rescheduled", color: "text-purple-600", bg: "bg-purple-100 border-l-2 border-purple-500" },
};

export default function ExecutiveVisits() {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [showControlCard, setShowControlCard] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showViewCard, setShowViewCard] = useState<VisitHistoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [controlCardVisit, setControlCardVisit] = useState("");
  const [controlCardVisitId, setControlCardVisitId] = useState<number | null>(null);

  // Geolocation state
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAddress, setGeoAddress] = useState<string>("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string>("");
  /** True when coordinates were loaded from the visit record (already persisted at meeting start). */
  const [geoFromPersistedMeetingStart, setGeoFromPersistedMeetingStart] = useState(false);

  // AVR Control card form state
  const [avrData, setAvrData] = useState<AVRData>(defaultAVR());

  const updateAVR = <K extends keyof AVRData>(key: K, value: AVRData[K]) => {
    setAvrData(prev => ({ ...prev, [key]: value }));
  };

  const updateActionItem = (idx: number, field: keyof AvrActionItemRow, value: string) => {
    setAvrData((prev) => {
      const items = [...prev.actionItems];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, actionItems: items };
    });
  };

  const addActionItem = () => {
    setAvrData((prev) => ({ ...prev, actionItems: [...prev.actionItems, emptyActionItem()] }));
  };

  const removeActionItem = (idx: number) => {
    setAvrData(prev => ({ ...prev, actionItems: prev.actionItems.filter((_, i) => i !== idx) }));
  };

  /** Latest AVR for flush handlers (tab close / visibility) without stale closures */
  const avrDataRef = useRef(avrData);
  avrDataRef.current = avrData;

  // Real data — backed by ExecutiveDataProvider so navigating away and back
  // does not refetch.
  const {
    visits,
    accounts,
    initialLoading: loading,
    refreshVisits,
    refreshAccounts,
    refreshTickets,
  } = useExecutiveData();
  const fetchData = async () => {
    await Promise.all([refreshVisits(), refreshAccounts()]);
  };

  // Schedule form state
  const [formCorporateId, setFormCorporateId] = useState("");
  const [formMeetingType, setFormMeetingType] = useState<"online" | "in_person">("in_person");
  const [formPurpose, setFormPurpose] = useState("");
  const [formAgenda, setFormAgenda] = useState("");
  const [formScheduleMode, setFormScheduleMode] = useState<VisitScheduleMode>("single");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formOnlineLink, setFormOnlineLink] = useState("");
  const [formAttendees, setFormAttendees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Department team (for the Attendees multi-select)
  const [departmentTeam, setDepartmentTeam] = useState<DepartmentTeamMember[]>([]);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [departmentTeamLoading, setDepartmentTeamLoading] = useState(false);
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const attendeesRef = useRef<HTMLDivElement | null>(null);

  // Searchable corporate customer picker (schedule visit)
  const [corporatePickerOpen, setCorporatePickerOpen] = useState(false);
  const [corporateSearch, setCorporateSearch] = useState("");
  const corporatePickerRef = useRef<HTMLDivElement | null>(null);
  const corporateSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [selectedVisit, setSelectedVisit] = useState<VisitRecord | null>(null);

  // Reschedule modal state
  const [rescheduleVisit, setRescheduleVisit] = useState<VisitRecord | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleMotivation, setRescheduleMotivation] = useState("");
  const [rescheduleNewDate, setRescheduleNewDate] = useState("");
  const [rescheduleNewTime, setRescheduleNewTime] = useState("");
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  const currentUser = getCurrentUser();

  // Calendar helpers
  const weekStart = startOfWeek(calendarDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(calendarDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const monthStart2 = startOfMonth(calendarDate);
  const monthEnd2 = endOfMonth(calendarDate);
  const calStart = startOfWeek(monthStart2, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd2, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const getVisitsForDate = (date: Date) => visits.filter(v => isSameDay(new Date(v.visitDate), date));

  const navigatePrev = () => setCalendarDate(calendarView === "week" ? addDays(calendarDate, -7) : addMonths(calendarDate, -1));
  const navigateNext = () => setCalendarDate(calendarView === "week" ? addDays(calendarDate, 7) : addMonths(calendarDate, 1));

  // Filter visits
  const upcomingVisits = visits.filter(v => ["pending", "approved", "confirmed", "rescheduled"].includes(v.status));
  const filteredVisits = upcomingVisits.filter(v =>
    searchQuery === "" ||
    v.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.location || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { visitReportsSorted, followUpPendingCount } = useMemo(() => {
    const pending = visits.filter((v) => v.status === "follow_up_pending");
    const closed = visits.filter((v) => v.status === "completed");
    return {
      visitReportsSorted: [...pending, ...closed],
      followUpPendingCount: pending.length,
    };
  }, [visits]);
  const isOverdueVisit = (visit: VisitRecord) => {
    const visitStart = new Date(`${visit.visitDate}T${visit.startTime}`);
    const now = new Date();
    return visitStart < now && ["pending", "approved", "confirmed", "rescheduled"].includes(visit.status);
  };
  const previousVisits = visits
    .filter(v => new Date(`${v.visitDate}T${v.startTime}`) < new Date())
    .sort((a, b) => new Date(`${b.visitDate}T${b.startTime}`).getTime() - new Date(`${a.visitDate}T${a.startTime}`).getTime());
  const overdueVisits = previousVisits.filter(isOverdueVisit);

  // Fetch control cards for completed visits
  const fetchControlCards = async (completed: VisitRecord[]) => {
    const cards: Record<number, ControlCardRecord> = {};
    await Promise.all(
      completed.map(async (v) => {
        try {
          const card = await getControlCard(v.visitId);
          cards[v.visitId] = card;
        } catch {
          // No control card for this visit
        }
      })
    );
    setControlCards(cards);
  };

  useEffect(() => {
    if (activeTab === "completed" && visitReportsSorted.length > 0) {
      fetchControlCards(visitReportsSorted);
    }
  }, [activeTab, visits]);

  useEffect(() => {
    const now = new Date();
    visits.forEach((visit) => {
      const start = new Date(`${visit.visitDate}T${visit.startTime}`);
      const hoursToStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
      const reminderKey = `visit_reminder_seen_${visit.visitId}_${visit.visitDate}`;
      const overdueKey = `visit_overdue_seen_${visit.visitId}_${visit.visitDate}`;

      if (hoursToStart > 0 && hoursToStart <= 24 && !localStorage.getItem(reminderKey)) {
        toast.info("Upcoming visit reminder", {
          description: `${visit.accountName} visit is scheduled on ${visit.visitDate} at ${visit.startTime}.`,
        });
        localStorage.setItem(reminderKey, "1");
      }

      if (isOverdueVisit(visit) && !localStorage.getItem(overdueKey)) {
        toast.warning("Overdue visit", {
          description: `${visit.accountName} visit was not started and is now overdue.`,
        });
        localStorage.setItem(overdueKey, "1");
      }
    });
  }, [visits]);

  const historyData: VisitHistoryItem[] = [
    { date: "Oct 23, 2024", corp: "Namibia Breweries", type: "Scheduled Review", exec: "Jane Smith", rating: 5 },
    { date: "Oct 21, 2024", corp: "Ohlthaver & List", type: "Issue Resolution", exec: "Jane Smith", rating: 2 },
    { date: "Oct 15, 2024", corp: "Ministry of Finance", type: "Sales Pitch", exec: "John Doe", rating: 4 },
  ];

  const quarterlyPreviewDates = useMemo(
    () => (formScheduleMode === "quarterly" && formDate ? quarterlyVisitDates(formDate) : []),
    [formScheduleMode, formDate],
  );

  const resetForm = () => {
    setFormCorporateId(""); setFormMeetingType("in_person"); setFormPurpose(""); setFormAgenda("");
    setFormScheduleMode("single");
    setFormDate(""); setFormStartTime(""); setFormEndTime(""); setFormLocation("");
    setFormOnlineLink(""); setFormAttendees([]); setAttendeesOpen(false);
    setCorporatePickerOpen(false);
    setCorporateSearch("");
  };

  // Fetch the department team once when the visit form is opened.
  useEffect(() => {
    if (!showSchedule) return;
    let cancelled = false;
    (async () => {
      try {
        setDepartmentTeamLoading(true);
        const data = await getDepartmentTeam();
        if (cancelled) return;
        setDepartmentTeam(data.members);
        setDepartmentName(data.department);
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error("Failed to load team", {
            description: err instanceof Error ? err.message : "Unable to load department teammates",
          });
        }
      } finally {
        if (!cancelled) setDepartmentTeamLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showSchedule]);

  // Close the attendees dropdown when clicking outside.
  useEffect(() => {
    if (!attendeesOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (attendeesRef.current && !attendeesRef.current.contains(e.target as Node)) {
        setAttendeesOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [attendeesOpen]);

  // Close corporate picker on outside click; focus search when opened.
  useEffect(() => {
    if (!corporatePickerOpen) return;
    corporateSearchInputRef.current?.focus();
    const onDocClick = (e: MouseEvent) => {
      if (corporatePickerRef.current && !corporatePickerRef.current.contains(e.target as Node)) {
        setCorporatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [corporatePickerOpen]);

  const toggleAttendee = (fullName: string) => {
    setFormAttendees((prev) =>
      prev.includes(fullName) ? prev.filter((n) => n !== fullName) : [...prev, fullName]
    );
  };

  const corporateOptions = useMemo(() => {
    const rows = Array.from(
      new Map(
        accounts
          .filter((acc) => acc.corporateId != null)
          .map((acc) => [
            acc.corporateId as number,
            { corporateId: acc.corporateId as number, corporateName: acc.corporateName || acc.accountName },
          ])
      ).values()
    );
    return rows.sort((a, b) =>
      a.corporateName.localeCompare(b.corporateName, undefined, { sensitivity: "base" })
    );
  }, [accounts]);

  const filteredCorporateOptions = useMemo(() => {
    const q = corporateSearch.trim().toLowerCase();
    if (!q) return corporateOptions;
    return corporateOptions.filter((c) => c.corporateName.toLowerCase().includes(q));
  }, [corporateOptions, corporateSearch]);

  const selectedCorporateName = useMemo(() => {
    if (!formCorporateId) return "";
    const id = Number(formCorporateId);
    return corporateOptions.find((c) => c.corporateId === id)?.corporateName ?? "";
  }, [corporateOptions, formCorporateId]);

  // Control card draft helpers
  const CC_DRAFT_PREFIX = "cc_draft_";
  const getDraftKey = (visitId: number) => `${CC_DRAFT_PREFIX}${visitId}`;

  const resetControlCard = () => {
    setAvrData(defaultAVR());
  };

  const persistDraftToStorage = (visitId: number, data: AVRData) => {
    try {
      const draft = { ...data, savedAt: new Date().toISOString() };
      localStorage.setItem(getDraftKey(visitId), JSON.stringify(draft));
    } catch {
      /* quota exceeded or private mode */
    }
  };

  const loadDraft = (visitId: number): boolean => {
    const raw = localStorage.getItem(getDraftKey(visitId));
    if (!raw) return false;
    try {
      const draft = JSON.parse(raw);
      const { savedAt: _, actionItems: rawItems, ...rest } = draft;
      const merged = { ...defaultAVR(), ...rest } as AVRData;
      if (rawItems && Array.isArray(rawItems)) {
        merged.actionItems = rawItems.map((row: Partial<AvrActionItemRow> & { action?: string; deadline?: string }) =>
          normalizeActionItem(row)
        );
      }
      setAvrData(merged);
      return true;
    } catch {
      return false;
    }
  };

  const clearDraft = (visitId: number) => {
    localStorage.removeItem(getDraftKey(visitId));
  };

  const hasDraft = (visitId: number) => localStorage.getItem(getDraftKey(visitId)) !== null;

  /** Keep localStorage aligned while typing so refresh / tab close does not lose the AVR */
  useEffect(() => {
    if (!showControlCard || controlCardVisitId == null) return;
    const visitId = controlCardVisitId;
    const t = window.setTimeout(() => {
      persistDraftToStorage(visitId, avrDataRef.current);
    }, 650);
    return () => window.clearTimeout(t);
  }, [avrData, showControlCard, controlCardVisitId]);

  useEffect(() => {
    if (!showControlCard || controlCardVisitId == null) return;
    const visitId = controlCardVisitId;
    const flush = () => persistDraftToStorage(visitId, avrDataRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [showControlCard, controlCardVisitId]);

  const closeControlCardModal = () => {
    if (controlCardVisitId != null) persistDraftToStorage(controlCardVisitId, avrData);
    setShowControlCard(false);
  };

  const openControlCard = (visit: VisitRecord) => {
    setControlCardVisit(visit.accountName);
    setControlCardVisitId(visit.visitId);
    resetControlCard();
    const resumed = loadDraft(visit.visitId);
    // Always override header fields from the visit schedule data
    setAvrData(prev => ({
      ...prev,
      accountName: visit.accountName,
      visitDate: visit.visitDate,
      csrManager: currentUser?.firstName || "",
      customerParticipants: resumed ? prev.customerParticipants : (visit.attendees?.join(", ") || ""),
    }));
    setShowControlCard(true);
    if (resumed) {
      toast.info("Draft restored", { description: "Your previously saved draft has been loaded." });
    }
    // GPS from server if meeting was already started; otherwise capture once and PATCH /meeting-start
    setGeoLocation(null);
    setGeoAddress("");
    setGeoError("");
    const lat0 = visit.startGeoLatitude != null ? Number(visit.startGeoLatitude) : NaN;
    const lng0 = visit.startGeoLongitude != null ? Number(visit.startGeoLongitude) : NaN;
    if (Number.isFinite(lat0) && Number.isFinite(lng0)) {
      setGeoFromPersistedMeetingStart(true);
      setGeoLocation({ lat: lat0, lng: lng0 });
      setGeoAddress(`${lat0.toFixed(6)}, ${lng0.toFixed(6)}`);
      setGeoLoading(false);
      setGeoError("");
    } else {
      setGeoFromPersistedMeetingStart(false);
      setGeoLoading(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            setGeoLocation({ lat: latitude, lng: longitude });
            setGeoAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
            setGeoLoading(false);
            try {
              await recordVisitMeetingStart(visit.visitId, { latitude, longitude });
              await refreshVisits();
            } catch {
              /* Keep working on the AVR if the save fails */
            }
          },
          (err) => {
            setGeoError(err.code === 1 ? "Location permission denied" : "Unable to retrieve location");
            setGeoLoading(false);
          },
          { enableHighAccuracy: true, timeout: 10000 },
        );
      } else {
        setGeoError("Geolocation not supported by this browser");
        setGeoLoading(false);
      }
    }
  };

  const handleScheduleVisit = async () => {
    if (!formCorporateId || !formPurpose || !formDate || !formStartTime || !formEndTime) {
      toast.error("Please fill in all required fields");
      return;
    }
    const visitDates =
      formScheduleMode === "quarterly" ? quarterlyVisitDates(formDate) : [formDate];
    if (formScheduleMode === "quarterly" && visitDates.length !== QUARTERLY_VISIT_COUNT) {
      toast.error("Please choose a valid first visit date for the quarterly schedule");
      return;
    }
    try {
      setSubmitting(true);
      const basePayload: Omit<VisitPayload, "visitDate"> = {
        corporateId: Number(formCorporateId),
        meetingType: formMeetingType,
        purpose: formPurpose,
        agenda: formAgenda || undefined,
        startTime: formStartTime,
        endTime: formEndTime,
        location: formMeetingType === "in_person" ? formLocation || undefined : undefined,
        onlineLink: formMeetingType === "online" ? formOnlineLink || undefined : undefined,
        attendees: formAttendees,
      };
      for (const visitDate of visitDates) {
        await createVisit({ ...basePayload, visitDate });
      }
      const count = visitDates.length;
      toast.success(count === 1 ? "Visit scheduled" : `${count} visits scheduled`, {
        description:
          count === 1
            ? "The customer will be notified and can approve or reschedule."
            : "Four monthly visits were created. The customer will be notified for each.",
      });
      setShowSchedule(false);
      resetForm();
      await fetchData();
    } catch (err: unknown) {
      toast.error("Failed to schedule visit", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptReschedule = async (visit: VisitRecord) => {
    try {
      await updateVisit(visit.visitId, { action: "accept_reschedule" });
      toast.success("Reschedule accepted", { description: `Visit with ${visit.accountName} rescheduled to ${visit.rescheduleDate}` });
      await fetchData();
    } catch (err: unknown) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const handleCancelVisit = async (visit: VisitRecord) => {
    try {
      await updateVisit(visit.visitId, { status: "cancelled" });
      toast.info("Visit cancelled", { description: `Visit with ${visit.accountName} has been cancelled.` });
      await fetchData();
    } catch (err: unknown) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const openRescheduleModal = (visit: VisitRecord) => {
    setRescheduleVisit(visit);
    setRescheduleReason("");
    setRescheduleMotivation("");
    setRescheduleNewDate("");
    setRescheduleNewTime("");
  };

  const handleSubmitReschedule = async () => {
    if (!rescheduleVisit) return;
    if (!rescheduleReason || !rescheduleMotivation || !rescheduleNewDate || !rescheduleNewTime) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      setRescheduleSubmitting(true);
      await requestReschedule(rescheduleVisit.visitId, {
        reason: rescheduleReason,
        motivation: rescheduleMotivation,
        newDate: rescheduleNewDate,
        newTime: rescheduleNewTime,
      });
      toast.success("Reschedule request submitted", {
        description: "Your manager will review and approve the request.",
      });
      setRescheduleVisit(null);
      await fetchData();
    } catch (err: unknown) {
      toast.error("Failed to submit reschedule", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const handleCompleteVisit = async (visit: VisitRecord) => {
    try {
      await updateVisit(visit.visitId, { status: "completed" });
      toast.success("Visit completed", { description: `Visit with ${visit.accountName} marked as completed.` });
      await fetchData();
    } catch (err: unknown) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const [submittingControlCard, setSubmittingControlCard] = useState(false);

  // Completed visits state
  const [controlCards, setControlCards] = useState<Record<number, ControlCardRecord>>({});
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [editFeedback, setEditFeedback] = useState<Record<number, string>>({});
  const [editHealth, setEditHealth] = useState<Record<number, "green" | "amber" | "red" | "">>({}); 
  const [savingCard, setSavingCard] = useState<number | null>(null);

  const handleSubmitControlCard = async () => {
    if (!controlCardVisitId) return;
    try {
      setSubmittingControlCard(true);
      const payload = {
        ...avrData,
        geoLatitude: geoLocation?.lat ?? null,
        geoLongitude: geoLocation?.lng ?? null,
      };
      const result = await submitControlCard(controlCardVisitId, payload as unknown as Record<string, unknown>);
      clearDraft(controlCardVisitId);
      setShowControlCard(false);
      const n = result.ticketsCreated ?? 0;
      const nums = result.ticketNumbers?.filter(Boolean) ?? [];
      const ticketLine =
        n > 0 && nums.length > 0
          ? `${n} ticket${n === 1 ? "" : "s"}: ${nums.join(", ")}. `
          : n > 0
            ? `${n} ticket${n === 1 ? "" : "s"} created from action items. `
            : "";
      toast.success("Control Card submitted", {
        description: `${ticketLine}The customer can rate this visit. Finish sections 6 & 7 under Visit reports to fully close it on your side.`,
      });
      await Promise.all([refreshVisits(), refreshAccounts(), refreshTickets()]);
    } catch (err: unknown) {
      toast.error("Failed to submit", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmittingControlCard(false);
    }
  };

  const handleSavePostCompletion = async (visitId: number) => {
    const feedback = editFeedback[visitId];
    const health = editHealth[visitId];
    if (!feedback && !health) {
      toast.error("Please fill in at least one field");
      return;
    }
    try {
      setSavingCard(visitId);
      const payload: { customerFeedback?: string; accountHealth?: "green" | "amber" | "red" } = {};
      if (feedback) payload.customerFeedback = feedback;
      if (health) payload.accountHealth = health;
      const { controlCard: updated, visit: updatedVisit } = await updateControlCard(visitId, payload);
      setControlCards(prev => ({ ...prev, [visitId]: updated }));
      if (updatedVisit) await refreshVisits();
      toast.success("Control card updated", { description: updatedVisit?.status === "completed" ? "Visit is now fully closed on your side." : "Post-completion fields saved." });
    } catch (err: unknown) {
      toast.error("Failed to update", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSavingCard(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pending": return "warning" as const;
      case "approved": return "default" as const;
      case "confirmed": return "success" as const;
      case "declined": return "danger" as const;
      case "rescheduled": return "neutral" as const;
      case "follow_up_pending": return "warning" as const;
      case "completed": return "neutral" as const;
      case "cancelled": return "neutral" as const;
      default: return "default" as const;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Visits & Engagements</h2>
          <p className="text-sm text-slate-500">Manage client visits, control cards, and feedback ratings.</p>
        </div>
        <Button className="flex items-center justify-center gap-2 w-full sm:w-auto" onClick={() => setShowSchedule(!showSchedule)}>
          <Plus className="h-4 w-4" /> Schedule Visit
        </Button>
      </div>

      {showSchedule && (
        <Card className="border-mtc-blue-100 bg-mtc-blue-50/30 animate-in slide-in-from-top-4">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Schedule New Visit / Meeting</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowSchedule(false); resetForm(); }}>Cancel</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-1">
                <Label>Corporate Customer <span className="text-red-500">*</span></Label>
                <div ref={corporatePickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCorporatePickerOpen((o) => {
                        const next = !o;
                        if (next) setCorporateSearch("");
                        return next;
                      });
                    }}
                    className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                  >
                    <span className={`flex min-w-0 flex-1 items-center gap-2 truncate ${selectedCorporateName ? "text-slate-900" : "text-slate-500"}`}>
                      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                      {selectedCorporateName || "Select corporate customer…"}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${corporatePickerOpen ? "rotate-180" : ""}`} />
                  </button>
                  {corporatePickerOpen && (
                    <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                      <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        <Input
                          ref={corporateSearchInputRef}
                          type="text"
                          value={corporateSearch}
                          onChange={(e) => setCorporateSearch(e.target.value)}
                          placeholder="Type to search…"
                          className="h-9 border-0 bg-transparent px-0 py-0 shadow-none ring-0 focus-visible:ring-0"
                          autoComplete="off"
                          aria-label="Search corporate customers"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {corporateOptions.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-slate-500">No assigned corporates found.</p>
                        ) : filteredCorporateOptions.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-slate-500">No matches for &quot;{corporateSearch.trim()}&quot;</p>
                        ) : (
                          filteredCorporateOptions.map((corp) => {
                            const isSelected = formCorporateId === String(corp.corporateId);
                            return (
                              <button
                                key={corp.corporateId}
                                type="button"
                                onClick={() => {
                                  setFormCorporateId(String(corp.corporateId));
                                  setCorporatePickerOpen(false);
                                  setCorporateSearch("");
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-mtc-blue-50 ${
                                  isSelected ? "bg-mtc-blue-50 font-medium text-mtc-blue" : "text-slate-800"
                                }`}
                              >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                                  {isSelected ? <Check className="h-4 w-4 text-mtc-blue" /> : null}
                                </span>
                                <span className="truncate">{corp.corporateName}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Meeting Type <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormMeetingType("in_person")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors ${formMeetingType === "in_person" ? "border-mtc-blue bg-mtc-blue-50 text-mtc-blue" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Building2 className="h-4 w-4" /> In Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMeetingType("online")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors ${formMeetingType === "online" ? "border-mtc-blue bg-mtc-blue-50 text-mtc-blue" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Video className="h-4 w-4" /> Online
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Purpose <span className="text-red-500">*</span></Label>
                <Select value={formPurpose} onChange={(e) => setFormPurpose(e.target.value)}>
                  <option value="">Select Purpose...</option>
                  <option value="Quarterly Service Review">Quarterly Service Review</option>
                  <option value="Issue Resolution Follow-up">Issue Resolution Follow-up</option>
                  <option value="New Product Demo">New Product Demo</option>
                  <option value="Renewal Discussion">Renewal Discussion</option>
                  <option value="Courtesy Visit">Courtesy Visit</option>
                  <option value="Onboarding">Onboarding</option>
                  <option value="Technical Support">Technical Support</option>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Schedule <span className="text-red-500">*</span></Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setFormScheduleMode("single")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors ${formScheduleMode === "single" ? "border-mtc-blue bg-mtc-blue-50 text-mtc-blue" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Calendar className="h-4 w-4" /> Single visit
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormScheduleMode("quarterly")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors ${formScheduleMode === "quarterly" ? "border-mtc-blue bg-mtc-blue-50 text-mtc-blue" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Calendar className="h-4 w-4" /> Quarterly (4 months)
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {formScheduleMode === "single"
                    ? "Schedule one meeting on the date you choose."
                    : "Schedule one meeting per month for four months, using the same time and details each month."}
                </p>
              </div>
              <div className="space-y-2">
                <Label>
                  {formScheduleMode === "quarterly" ? "First visit date" : "Visit date"}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                {formScheduleMode === "quarterly" && quarterlyPreviewDates.length > 0 && (
                  <ul className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 space-y-1">
                    {quarterlyPreviewDates.map((d, i) => (
                      <li key={d}>
                        Month {i + 1}: {format(new Date(`${d}T12:00:00`), "EEE, MMM d, yyyy")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <Label>Start Time <span className="text-red-500">*</span></Label>
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Time <span className="text-red-500">*</span></Label>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
              </div>
              {formMeetingType === "in_person" ? (
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input placeholder="e.g. Head Office, Windhoek" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Meeting Link</Label>
                  <Input placeholder="e.g. https://teams.microsoft.com/..." value={formOnlineLink} onChange={(e) => setFormOnlineLink(e.target.value)} />
                </div>
              )}
              <div className="space-y-2" ref={attendeesRef}>
                <Label>
                  Attendees
                  {departmentName && (
                    <span className="ml-2 text-xs font-normal text-slate-500">— {departmentName}</span>
                  )}
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAttendeesOpen((o) => !o)}
                    disabled={departmentTeamLoading}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-mtc-blue disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="truncate text-left">
                      {departmentTeamLoading
                        ? "Loading team..."
                        : formAttendees.length === 0
                          ? "Select attendees..."
                          : `${formAttendees.length} selected`}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${attendeesOpen ? "rotate-180" : ""}`} />
                  </button>
                  {attendeesOpen && (
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                      {departmentTeam.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">
                          {departmentTeamLoading ? "Loading..." : "No teammates found in your department."}
                        </div>
                      ) : (
                        departmentTeam.map((m) => {
                          const checked = formAttendees.includes(m.fullName);
                          const roleLabel = m.role === "manager"
                            ? "Manager"
                            : m.role === "supervisor"
                              ? "Supervisor"
                              : "Executive";
                          return (
                            <button
                              type="button"
                              key={m.id}
                              onClick={() => toggleAttendee(m.fullName)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${checked ? "bg-mtc-blue-50/40" : ""}`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-mtc-blue bg-mtc-blue text-white" : "border-slate-300 bg-white"}`}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <span className="truncate">
                                  <span className="font-medium text-slate-800">{m.fullName}</span>
                                  <span className="ml-2 text-xs text-slate-500">{roleLabel}</span>
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {formAttendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formAttendees.map((name) => (
                      <Badge
                        key={name}
                        variant="default"
                        className="flex items-center gap-1 pr-1.5"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => toggleAttendee(name)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
                          aria-label={`Remove ${name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2 lg:col-span-1">
                <Label>Agenda</Label>
                <textarea
                  className="flex min-h-[60px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                  placeholder="Brief agenda for the meeting..."
                  value={formAgenda}
                  onChange={(e) => setFormAgenda(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => { setShowSchedule(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleScheduleVisit} disabled={submitting}>
                {submitting
                  ? "Scheduling..."
                  : formScheduleMode === "quarterly"
                    ? "Schedule 4 visits"
                    : "Schedule visit"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rescheduled visits (customer proposed new time) */}
      {visits.filter(v => v.status === "rescheduled").length > 0 && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-600" />
              Customer Reschedule Requests
              <Badge variant="warning" className="ml-2">
                {visits.filter(v => v.status === "rescheduled").length} Pending
              </Badge>
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corporate</TableHead>
                <TableHead>Original Date</TableHead>
                <TableHead>Proposed Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.filter(v => v.status === "rescheduled").map(v => (
                <TableRow key={v.visitId}>
                  <TableCell className="font-medium text-slate-900">{v.accountName}</TableCell>
                  <TableCell className="text-slate-500">{v.visitDate} {v.startTime}-{v.endTime}</TableCell>
                  <TableCell className="font-medium">{v.rescheduleDate} {v.rescheduleStartTime}-{v.rescheduleEndTime}</TableCell>
                  <TableCell className="text-sm text-slate-500 max-w-xs truncate">{v.rescheduleReason || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 border-green-300 hover:bg-green-50 text-xs"
                        onClick={() => handleAcceptReschedule(v)}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-700 border-red-300 hover:bg-red-50 text-xs"
                        onClick={() => handleCancelVisit(v)}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Calendar View */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-xl">
              {format(calendarDate, "MMMM yyyy")}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="flex rounded-md border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setCalendarView("week")}
                  className={`px-3 py-1.5 text-xs font-medium ${calendarView === "week" ? "bg-mtc-blue text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >Week</button>
                <button
                  onClick={() => setCalendarView("month")}
                  className={`px-3 py-1.5 text-xs font-medium ${calendarView === "month" ? "bg-mtc-blue text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >Month</button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={navigatePrev}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setCalendarDate(new Date())}>Today</Button>
                <Button variant="outline" size="sm" onClick={navigateNext}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {calendarView === "week" ? (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="grid grid-cols-7 gap-2 min-w-[560px]">
              {weekDays.map((day, index) => {
                const dayVisits = getVisitsForDate(day);
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={index} className={`min-h-32 p-3 rounded-lg border ${isToday ? "border-blue-400 bg-blue-50/50" : "border-slate-200"}`}>
                    <div className="font-semibold mb-2">
                      <div className="text-xs text-slate-500">{format(day, "EEE")}</div>
                      <div className={`text-sm ${isToday ? "text-blue-600" : "text-slate-900"}`}>{format(day, "d")}</div>
                    </div>
                    <div className="space-y-1.5">
                      {dayVisits.map(visit => (
                        <button
                          key={visit.visitId}
                          onClick={() => setSelectedVisit(visit)}
                          className={`w-full text-left p-1.5 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity ${statusConfig[visit.status]?.bg ?? "bg-gray-100"}`}
                        >
                          <div className="font-medium truncate">{visit.accountName}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            {visit.meetingType === "online" ? <Video className="h-2.5 w-2.5" /> : <MapPin className="h-2.5 w-2.5" />}
                            {visit.startTime}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="min-w-[560px]">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, index) => {
                  const dayVisits = getVisitsForDate(day);
                  const isToday = isSameDay(day, new Date());
                  const isCurrentMonth = day.getMonth() === calendarDate.getMonth();
                  return (
                    <div key={index} className={`min-h-24 p-2 rounded-lg border ${isToday ? "border-blue-400 bg-blue-50/50" : "border-slate-200"} ${!isCurrentMonth ? "opacity-40" : ""}`}>
                      <div className={`text-xs font-medium mb-1 ${isToday ? "text-blue-600" : "text-slate-700"}`}>{format(day, "d")}</div>
                      <div className="space-y-1">
                        {dayVisits.slice(0, 2).map(visit => (
                          <button
                            key={visit.visitId}
                            onClick={() => setSelectedVisit(visit)}
                            className={`w-full text-left px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:opacity-80 ${statusConfig[visit.status]?.bg ?? "bg-gray-100"}`}
                          >
                            {visit.accountName}
                          </button>
                        ))}
                        {dayVisits.length > 2 && (
                          <div className="text-[10px] text-slate-400 px-1">+{dayVisits.length - 2} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Visit Detail */}
      {selectedVisit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <div>
                <CardTitle className="text-lg">{selectedVisit.accountName}</CardTitle>
                <p className="text-sm text-slate-500 mt-1">{selectedVisit.purpose}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(selectedVisit.status)}>
                  {statusConfig[selectedVisit.status]?.label ?? selectedVisit.status}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => setSelectedVisit(null)}><X className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-slate-500">Date</p>
                    <p className="font-medium">{selectedVisit.visitDate}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-slate-500">Time</p>
                    <p className="font-medium">{selectedVisit.startTime} - {selectedVisit.endTime}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  {selectedVisit.meetingType === "online" ? <Video className="h-4 w-4 text-slate-400 mt-0.5" /> : <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />}
                  <div>
                    <p className="text-slate-500">{selectedVisit.meetingType === "online" ? "Online Meeting" : "Location"}</p>
                    <p className="font-medium">{selectedVisit.meetingType === "online" ? (selectedVisit.onlineLink || "Link TBD") : (selectedVisit.location || "TBD")}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-slate-500">Attendees</p>
                    <p className="font-medium">{selectedVisit.attendees?.length > 0 ? selectedVisit.attendees.join(", ") : "—"}</p>
                  </div>
                </div>
              </div>
              {(() => {
                const sl = selectedVisit.startGeoLatitude != null ? Number(selectedVisit.startGeoLatitude) : NaN;
                const sg = selectedVisit.startGeoLongitude != null ? Number(selectedVisit.startGeoLongitude) : NaN;
                if (!Number.isFinite(sl) || !Number.isFinite(sg)) return null;
                return (
                  <div className="rounded-lg border border-mtc-blue-100 bg-mtc-blue-50/50 p-3">
                    <p className="text-sm font-medium text-mtc-blue-dark mb-1 flex items-center gap-2">
                      <Navigation className="h-4 w-4 shrink-0" aria-hidden />
                      Meeting started (GPS)
                    </p>
                    {selectedVisit.meetingStartedAt && (
                      <p className="text-xs text-slate-600 mb-2">
                        {new Date(selectedVisit.meetingStartedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    )}
                    <p className="text-xs font-mono text-slate-700 mb-2">
                      {sl.toFixed(6)}, {sg.toFixed(6)}
                    </p>
                    <a
                      href={openStreetMapMeetingStartLink(sl, sg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-mtc-blue hover:underline"
                    >
                      Open in map →
                    </a>
                  </div>
                );
              })()}
              {selectedVisit.agenda && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-700 mb-1">Agenda</p>
                  <p className="text-sm text-slate-600">{selectedVisit.agenda}</p>
                </div>
              )}
              {selectedVisit.customerResponse && (
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-sm font-medium text-blue-700 mb-1">Customer Response</p>
                  <p className="text-sm text-blue-600">{selectedVisit.customerResponse}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t border-slate-200">
                {selectedVisit.status === "pending" && (
                  <div className="flex-1">
                    <Badge variant="warning" className="w-full justify-center py-2">
                      Waiting for customer acceptance
                    </Badge>
                  </div>
                )}
                {selectedVisit.status === "approved" && (
                  <Button className="flex-1 text-xs" onClick={() => { handleCompleteVisit(selectedVisit); setSelectedVisit(null); }}>
                    Mark Completed
                  </Button>
                )}
                {selectedVisit.status === "rescheduled" && (
                  <Button className="flex-1 text-xs bg-green-600 hover:bg-green-700" onClick={() => { handleAcceptReschedule(selectedVisit); setSelectedVisit(null); }}>
                    Accept Reschedule
                  </Button>
                )}
                {["pending", "approved", "confirmed"].includes(selectedVisit.status) && (
                  <Button variant="outline" className="flex-1 text-xs text-red-600 border-red-200" onClick={() => { handleCancelVisit(selectedVisit); setSelectedVisit(null); }}>
                    Cancel Visit
                  </Button>
                )}
                <Button variant="outline" className="flex-1 text-xs" onClick={() => setSelectedVisit(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pending</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Approved</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Rescheduled</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Awaiting AVR closure</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-500" /> Visit closed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Declined</span>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "upcoming" ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
        >
          Upcoming Visits
        </button>
         <button
          onClick={() => setActiveTab("completed")}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "completed" ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
        >
          Visit reports
          {(followUpPendingCount > 0) && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              {followUpPendingCount} open
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("previous")}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "previous" ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
        >
          Previous Visits
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "history" ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
        >
          Control Cards History
        </button>
      </div>

      {activeTab === "upcoming" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
            <h3 className="text-lg font-medium">Upcoming Visits ({upcomingVisits.length})</h3>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                className="pl-9 w-full sm:w-64"
                placeholder="Search visits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading visits...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredVisits.map((visit) => (
                <Card key={visit.visitId} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{visit.accountName}</CardTitle>
                        {hasDraft(visit.visitId) && (
                          <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5">Draft</Badge>
                        )}
                      </div>
                      <Badge variant="warning">{visit.visitDate === new Date().toISOString().split("T")[0] ? `Today, ${visit.startTime}` : `${visit.visitDate}, ${visit.startTime}`}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      {visit.meetingType === "online" ? (
                        <><Video className="h-3 w-3" /> {visit.onlineLink || "Online Meeting"}</>
                      ) : (
                        <><MapPin className="h-3 w-3" /> {visit.location || "In Person"}</>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between">
                    <div className="space-y-2 text-sm text-slate-700 my-4">
                      <p><strong>Agenda:</strong> {visit.agenda || visit.purpose}</p>
                      {visit.attendees?.length > 0 && <p><strong>Attendees:</strong> {visit.attendees.join(", ")}</p>}
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                      {visit.status === "pending" ? (
                        <div className="flex-1 text-center">
                          <Badge variant="warning" className="text-xs">Waiting for customer acceptance</Badge>
                        </div>
                      ) : visit.status === "rescheduled" ? (
                        <Button
                          className="flex-1 text-xs bg-green-600 hover:bg-green-700"
                          onClick={() => handleAcceptReschedule(visit)}
                        >
                          Accept Reschedule
                        </Button>
                      ) : visit.execRescheduleStatus === "pending_approval" ? (
                        <div className="flex-1 text-center">
                          <Badge variant="warning" className="text-xs">Reschedule Pending Manager Approval</Badge>
                        </div>
                      ) : (
                        <>
                          <Button variant="outline" className="flex-1 text-xs" onClick={() => openRescheduleModal(visit)}>
                            Reschedule
                          </Button>
                          <Button 
                            className="flex-1 text-xs bg-slate-800" 
                            onClick={() => openControlCard(visit)}
                            disabled={!["approved", "confirmed"].includes(visit.status)}
                          >
                            {hasDraft(visit.visitId) ? "Continue Draft" : "Start Visit"}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredVisits.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  {visits.length === 0 ? "No visits scheduled yet. Click 'Schedule Visit' to create one." : "No visits match your search."}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "previous" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Previous Visits ({previousVisits.length})</h3>
            {overdueVisits.length > 0 && (
              <Badge variant="danger">{overdueVisits.length} Overdue</Badge>
            )}
          </div>
          {previousVisits.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No previous visits yet.</div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corporate</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Meeting Type</TableHead>
                    <TableHead className="whitespace-nowrap">Meeting start</TableHead>
                    <TableHead className="whitespace-nowrap">Start GPS</TableHead>
                    <TableHead>Reminder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previousVisits.map((visit) => {
                    const sl = visit.startGeoLatitude != null ? Number(visit.startGeoLatitude) : NaN;
                    const sg = visit.startGeoLongitude != null ? Number(visit.startGeoLongitude) : NaN;
                    const hasStartGps = Number.isFinite(sl) && Number.isFinite(sg);
                    return (
                    <TableRow key={visit.visitId}>
                      <TableCell className="font-medium text-slate-900">{visit.accountName}</TableCell>
                      <TableCell>{visit.visitDate}</TableCell>
                      <TableCell>{visit.startTime} - {visit.endTime}</TableCell>
                      <TableCell>
                        {isOverdueVisit(visit) ? (
                          <Badge variant="danger">Overdue</Badge>
                        ) : (
                          <Badge variant={getStatusBadgeVariant(visit.status)}>
                            {statusConfig[visit.status]?.label ?? visit.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{visit.meetingType.replace("_", " ")}</TableCell>
                      <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                        {visit.meetingStartedAt
                          ? new Date(visit.meetingStartedAt).toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {hasStartGps ? (
                          <a
                            href={openStreetMapMeetingStartLink(sl, sg)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-mtc-blue font-medium hover:underline"
                          >
                            Map
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {isOverdueVisit(visit)
                          ? "Escalate / notify customer"
                          : "Completed or closed"}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* ============ COMPLETED VISITS TAB ============ */}
      {activeTab === "completed" && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">
            Visit reports ({visitReportsSorted.length})
            {followUpPendingCount > 0 && (
              <span className="ml-2 text-sm font-normal text-amber-700">
                · {followUpPendingCount} awaiting sections 6–7
              </span>
            )}
          </h3>
          {visitReportsSorted.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No submitted visit reports yet.</div>
          ) : (
            <div className="space-y-4">
              {visitReportsSorted.flatMap((visit, idx) => {
                const prev = idx > 0 ? visitReportsSorted[idx - 1] : null;
                const showAwaitingHeader =
                  visit.status === "follow_up_pending" &&
                  (!prev || prev.status !== "follow_up_pending");
                const showClosedHeader =
                  visit.status === "completed" && (!prev || prev.status !== "completed");
                const card = controlCards[visit.visitId];
                const isExpanded = expandedCard === visit.visitId;
                const awaitingClosure = visit.status === "follow_up_pending";

                const out: JSX.Element[] = [];
                if (showAwaitingHeader) {
                  out.push(
                    <div key={`hdr-awaiting-${visit.visitId}`} className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
                      <p className="text-sm font-semibold text-amber-900">Awaiting AVR closure</p>
                      <p className="text-xs text-amber-900/80 mt-0.5">
                        Report submitted — finish section 6 (customer feedback) and section 7 (account health). The customer can still rate this visit.
                      </p>
                    </div>,
                  );
                }
                if (showClosedHeader) {
                  out.push(
                    <div key={`hdr-closed-${visit.visitId}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 mt-4 first:mt-0">
                      <p className="text-sm font-semibold text-slate-800">Closed visits</p>
                      <p className="text-xs text-slate-500 mt-0.5">All sections of the AVR are complete.</p>
                    </div>,
                  );
                }

                out.push(
                  <Card key={visit.visitId} className="overflow-hidden">
                    {/* Summary row */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedCard(isExpanded ? null : visit.visitId)}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${
                            awaitingClosure ? "bg-amber-100" : "bg-green-100"
                          }`}
                        >
                          {awaitingClosure ? (
                            <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />
                          ) : (
                            <CheckCircle className="h-5 w-5 text-green-600" aria-hidden />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{visit.accountName}</p>
                          <p className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                            <Calendar className="h-3 w-3" /> {visit.visitDate}
                            <span className="mx-1">·</span>
                            <Clock className="h-3 w-3" /> {visit.startTime} - {visit.endTime}
                            {visit.meetingType === "online" ? (
                              <><span className="mx-1">·</span><Video className="h-3 w-3" /> Online</>
                            ) : (
                              <><span className="mx-1">·</span><MapPin className="h-3 w-3" /> {visit.location || "In Person"}</>
                            )}
                            {(() => {
                              const sl = visit.startGeoLatitude != null ? Number(visit.startGeoLatitude) : NaN;
                              const sg = visit.startGeoLongitude != null ? Number(visit.startGeoLongitude) : NaN;
                              if (!Number.isFinite(sl) || !Number.isFinite(sg)) return null;
                              return (
                                <>
                                  <span className="mx-1">·</span>
                                  <a
                                    href={openStreetMapMeetingStartLink(sl, sg)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-mtc-blue text-xs font-medium hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Meeting start GPS
                                  </a>
                                </>
                              );
                            })()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {visit.customerRating && (
                          <div className="flex items-center gap-1 text-sm">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span className="font-medium">{visit.customerRating}/5</span>
                          </div>
                        )}
                        {card?.accountHealth && (
                          <Badge variant={card.accountHealth === "green" ? "success" : card.accountHealth === "amber" ? "warning" : "danger"}>
                            {card.accountHealth.charAt(0).toUpperCase() + card.accountHealth.slice(1)}
                          </Badge>
                        )}
                        <Badge variant={awaitingClosure ? "warning" : "neutral"}>
                          {awaitingClosure ? "Awaiting AVR closure" : "Visit closed"}
                        </Badge>
                        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded control card view */}
                    {isExpanded && card && (
                      <div className="border-t border-slate-200 p-6 space-y-6 bg-slate-50/50">
                        {/* Customer Rating Banner */}
                        {visit.customerRating && (
                          <div className={`rounded-lg p-4 flex items-start gap-3 ${visit.customerRating >= 4 ? "bg-green-50 border border-green-200" : visit.customerRating >= 3 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
                            <Star className={`h-5 w-5 mt-0.5 ${visit.customerRating >= 4 ? "fill-green-500 text-green-500" : visit.customerRating >= 3 ? "fill-amber-500 text-amber-500" : "fill-red-500 text-red-500"}`} />
                            <div>
                              <p className="font-semibold text-sm">Customer Rating: {visit.customerRating}/5</p>
                              {visit.customerRatingComment && <p className="text-sm mt-1 text-slate-600">{visit.customerRatingComment}</p>}
                            </div>
                          </div>
                        )}

                        {/* Header Fields */}
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wide mb-3">Visit Details</h4>
                          <div className="grid gap-3 md:grid-cols-4 text-sm">
                            <div><span className="text-slate-500 block text-xs">Account</span><span className="font-medium">{card.accountName}</span></div>
                            <div><span className="text-slate-500 block text-xs">Visit Date</span><span className="font-medium">{card.visitDate}</span></div>
                            <div><span className="text-slate-500 block text-xs">CSR / Account Manager</span><span className="font-medium">{card.csrManager || "—"}</span></div>
                            <div><span className="text-slate-500 block text-xs">Participants</span><span className="font-medium">{card.customerParticipants || "—"}</span></div>
                          </div>
                        </div>

                        {/* Section 1: Visit Objective */}
                        <AVRSection number={1} title="Visit Objective">
                          <p className="text-sm text-slate-700 bg-white rounded-md border border-slate-200 p-3">{card.visitObjective || "—"}</p>
                        </AVRSection>

                        {/* Section 2: SLA & Service Performance */}
                        <AVRSection number={2} title="SLA & Service Performance">
                          <div className="grid gap-3 md:grid-cols-3 text-sm">
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">SLA Compliance</span>
                              <span className="font-medium">{card.slaCompliance || "—"}</span>
                            </div>
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Open Tickets</span>
                              <span className="font-medium">{card.openTickets || "—"}</span>
                            </div>
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Critical Incidents</span>
                              <span className="font-medium">{card.criticalIncidents || "—"}</span>
                            </div>
                          </div>
                        </AVRSection>

                        {/* Section 3: Risks Identified */}
                        <AVRSection number={3} title="Risks Identified">
                          <div className="grid gap-3 md:grid-cols-3 text-sm">
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Operational</span>
                              <span className="font-medium">{card.risksOperational || "—"}</span>
                            </div>
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Commercial</span>
                              <span className="font-medium">{card.risksCommercial || "—"}</span>
                            </div>
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Competitive</span>
                              <span className="font-medium">{card.risksCompetitive || "—"}</span>
                            </div>
                          </div>
                        </AVRSection>

                        {/* Section 4: Opportunities */}
                        <AVRSection number={4} title="Opportunities">
                          <div className="grid gap-3 md:grid-cols-2 text-sm">
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Upsell / Cross-sell</span>
                              <span className="font-medium">{card.opportunitiesUpsell || "—"}</span>
                            </div>
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <span className="text-slate-500 text-xs block mb-1">Process Improvements</span>
                              <span className="font-medium">{card.opportunitiesProcess || "—"}</span>
                            </div>
                          </div>
                        </AVRSection>

                        {/* Section 5: Action Items (tickets created on submit) */}
                        <AVRSection number={5} title="Action Items">
                          {card.actionItems && card.actionItems.length > 0 ? (
                            <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
                              <table className="w-full text-sm min-w-[720px]">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Category</th>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Type</th>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Item</th>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Qty</th>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Due</th>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Owner</th>
                                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {card.actionItems.map((raw, idx) => {
                                    const row = raw as Record<string, string | undefined>;
                                    const itemText = String(row.item ?? row.action ?? "—");
                                    const due = String(row.dueDate ?? row.deadline ?? "—");
                                    const cat = row.category === "complaint" ? "Complaint" : "Request";
                                    return (
                                      <tr key={idx} className="border-t border-slate-100">
                                        <td className="px-3 py-2">{cat}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{row.requestType ? row.requestType.replace(/_/g, " ") : "—"}</td>
                                        <td className="px-3 py-2 max-w-[220px]">{itemText}</td>
                                        <td className="px-3 py-2">{row.quantity ?? "—"}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{due}</td>
                                        <td className="px-3 py-2">{row.owner ?? "—"}</td>
                                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={row.notes}>{row.notes || "—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500 italic">No action items recorded.</p>
                          )}
                        </AVRSection>

                        {/* Section 6: Customer Feedback — EDITABLE */}
                        <AVRSection number={6} title="Customer Feedback (Positives / Concerns)">
                          {card.customerFeedback ? (
                            <div className="bg-white rounded-md border border-slate-200 p-3">
                              <p className="text-sm text-slate-700">{card.customerFeedback}</p>
                            </div>
                          ) : (
                            <textarea
                              className="flex min-h-[80px] w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                              placeholder="Summarize customer feedback — positives and concerns raised during the visit..."
                              value={editFeedback[visit.visitId] || ""}
                              onChange={(e) => setEditFeedback(prev => ({ ...prev, [visit.visitId]: e.target.value }))}
                            />
                          )}
                        </AVRSection>

                        {/* Section 7: Overall Account Health — EDITABLE */}
                        <AVRSection number={7} title="Overall Account Health">
                          {card.accountHealth ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                                card.accountHealth === "green" ? "bg-green-100 text-green-700" :
                                card.accountHealth === "amber" ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                <span className={`h-2.5 w-2.5 rounded-full ${
                                  card.accountHealth === "green" ? "bg-green-500" :
                                  card.accountHealth === "amber" ? "bg-amber-500" :
                                  "bg-red-500"
                                }`} />
                                {card.accountHealth.charAt(0).toUpperCase() + card.accountHealth.slice(1)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex gap-3">
                              {(["green", "amber", "red"] as const).map((color) => (
                                <button
                                  key={color}
                                  onClick={() => setEditHealth(prev => ({ ...prev, [visit.visitId]: color }))}
                                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                                    editHealth[visit.visitId] === color
                                      ? color === "green" ? "border-green-500 bg-green-50 text-green-700"
                                        : color === "amber" ? "border-amber-500 bg-amber-50 text-amber-700"
                                        : "border-red-500 bg-red-50 text-red-700"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                  }`}
                                >
                                  <span className={`h-3 w-3 rounded-full ${
                                    color === "green" ? "bg-green-500" : color === "amber" ? "bg-amber-500" : "bg-red-500"
                                  }`} />
                                  {color.charAt(0).toUpperCase() + color.slice(1)}
                                </button>
                              ))}
                            </div>
                          )}
                        </AVRSection>

                        {/* Save button — only show if either field is still editable */}
                        {(!card.customerFeedback || !card.accountHealth) && (
                          <div className="flex justify-end pt-4 border-t border-slate-200">
                            <Button
                              onClick={() => handleSavePostCompletion(visit.visitId)}
                              disabled={savingCard === visit.visitId}
                              className="flex items-center gap-2"
                            >
                              <Send className="h-4 w-4" />
                              {savingCard === visit.visitId ? "Saving..." : "Save Assessment"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expanded but no control card */}
                    {isExpanded && !card && (
                      <div className="border-t border-slate-200 p-6 text-center text-slate-500">
                        No control card was submitted for this visit.
                      </div>
                    )}
                  </Card>
                );
                return out;
              })}
            </div>
          )}
        </div>
      )}

      {/* ============ AVR CONTROL CARD MODAL ============ */}
      {showControlCard && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="sticky top-0 bg-white border-b border-slate-200 z-10 flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-mtc-blue" />
                  Account Visit Report (AVR) — {controlCardVisit}
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Complete the control card during or after the customer visit. Progress is saved automatically on this device.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={closeControlCardModal}>Close</Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* GPS Verification Banner */}
              <div className={`rounded-md p-4 flex items-start gap-3 ${geoLocation ? "bg-mtc-blue-50 border border-mtc-blue-100" : geoError ? "bg-red-50 border border-red-200" : "bg-slate-50 border border-slate-200"}`}>
                 {geoLoading ? (
                   <div className="h-5 w-5 mt-0.5 rounded-full border-2 border-mtc-blue border-t-transparent animate-spin" />
                 ) : geoLocation ? (
                   <CheckCircle className="h-5 w-5 text-mtc-blue mt-0.5" />
                 ) : (
                   <Navigation className="h-5 w-5 text-red-500 mt-0.5" />
                 )}
                 <div className="flex-1">
                   <h4 className={`font-semibold ${geoLocation ? "text-mtc-blue-dark" : geoError ? "text-red-700" : "text-slate-700"}`}>
                     {geoLoading ? "Fetching Location..." : geoLocation ? "Presence Verified" : "Location Unavailable"}
                   </h4>
                   <p className={`text-sm ${geoLocation ? "text-mtc-blue" : geoError ? "text-red-600" : "text-slate-500"}`}>
                     {geoLoading ? "Requesting GPS coordinates..." : geoLocation
                       ? geoFromPersistedMeetingStart
                         ? "This position was saved when you started the meeting — it is visible to you and your manager."
                         : "GPS saved as meeting start — visible to your manager and on Past visits."
                       : geoError}
                   </p>
                   <div className="mt-2">
                     <Input
                       readOnly
                       value={geoLoading ? "Fetching coordinates..." : geoError ? geoError : geoAddress}
                       className={`text-xs font-mono ${geoLocation ? "bg-white/80 text-mtc-blue-dark border-mtc-blue-100" : geoError ? "bg-white/80 text-red-600 border-red-200" : "bg-white text-slate-500 border-slate-200"} cursor-default`}
                     />
                   </div>
                 </div>
              </div>

              {/* Header Fields */}
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
                <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Visit Details</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Account Name</Label>
                    <Input value={avrData.accountName} readOnly className="bg-slate-100 text-slate-600 cursor-default" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Visit Date</Label>
                    <Input value={avrData.visitDate} readOnly className="bg-slate-100 text-slate-600 cursor-default" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CSR / Account Manager</Label>
                    <Input value={avrData.csrManager} readOnly className="bg-slate-100 text-slate-600 cursor-default" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Customer Participants</Label>
                    <Input value={avrData.customerParticipants} onChange={(e) => updateAVR("customerParticipants", e.target.value)} placeholder="Names and roles" />
                  </div>
                </div>
              </div>

              {/* Section 1: Visit Objective */}
              <AVRSection number={1} title="Visit Objective">
                <textarea
                  className="flex min-h-[60px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                  placeholder="Describe the purpose and objective of this visit..."
                  value={avrData.visitObjective}
                  onChange={(e) => updateAVR("visitObjective", e.target.value)}
                />
              </AVRSection>

              {/* Section 2: SLA & Service Performance */}
              <AVRSection number={2} title="SLA & Service Performance">
                <p className="text-xs text-slate-500 -mt-1 mb-2">
                  Use the arrow on each field to see suggestions, or type your own value.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">SLA Compliance %</Label>
                    <AvrDatalistField
                      id="avr-sla-compliance"
                      value={avrData.slaCompliance}
                      onChange={(v) => updateAVR("slaCompliance", v)}
                      placeholder="e.g. 95% or pick a suggestion"
                      suggestions={AVR_SLA_COMPLIANCE_SUGGESTIONS}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Open Tickets</Label>
                    <AvrDatalistField
                      id="avr-open-tickets"
                      value={avrData.openTickets}
                      onChange={(v) => updateAVR("openTickets", v)}
                      placeholder="Count or pick a suggestion"
                      suggestions={AVR_OPEN_TICKETS_SUGGESTIONS}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Critical Incidents</Label>
                    <AvrDatalistField
                      id="avr-critical-incidents"
                      value={avrData.criticalIncidents}
                      onChange={(v) => updateAVR("criticalIncidents", v)}
                      placeholder="Count or pick a suggestion"
                      suggestions={AVR_CRITICAL_INCIDENTS_SUGGESTIONS}
                    />
                  </div>
                </div>
              </AVRSection>

              {/* Section 3: Risks Identified */}
              <AVRSection number={3} title="Risks Identified">
                <p className="text-xs text-slate-500 -mt-1 mb-2">
                  Choose a quick option to fill the field, then edit or add detail below.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Operational</Label>
                    <AvrPresetSelect
                      ariaLabel="Operational risk quick options"
                      options={AVR_RISK_OPERATIONAL_PRESETS}
                      onSelect={(v) => updateAVR("risksOperational", v)}
                    />
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                      placeholder="Equipment, network, SLA risks… or refine the quick option above"
                      value={avrData.risksOperational}
                      onChange={(e) => updateAVR("risksOperational", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Commercial</Label>
                    <AvrPresetSelect
                      ariaLabel="Commercial risk quick options"
                      options={AVR_RISK_COMMERCIAL_PRESETS}
                      onSelect={(v) => updateAVR("risksCommercial", v)}
                    />
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                      placeholder="Contract, pricing, retention risks…"
                      value={avrData.risksCommercial}
                      onChange={(e) => updateAVR("risksCommercial", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Competitive</Label>
                    <AvrPresetSelect
                      ariaLabel="Competitive risk quick options"
                      options={AVR_RISK_COMPETITIVE_PRESETS}
                      onSelect={(v) => updateAVR("risksCompetitive", v)}
                    />
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                      placeholder="Competitor activity, market threats…"
                      value={avrData.risksCompetitive}
                      onChange={(e) => updateAVR("risksCompetitive", e.target.value)}
                    />
                  </div>
                </div>
              </AVRSection>

              {/* Section 4: Opportunities */}
              <AVRSection number={4} title="Opportunities">
                <p className="text-xs text-slate-500 -mt-1 mb-2">
                  Choose a quick option to fill the field, then edit or add detail below.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Upsell / Cross-sell</Label>
                    <AvrPresetSelect
                      ariaLabel="Upsell quick options"
                      options={AVR_OPPORTUNITY_UPSELL_PRESETS}
                      onSelect={(v) => updateAVR("opportunitiesUpsell", v)}
                    />
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                      placeholder="Product upgrade, additional services…"
                      value={avrData.opportunitiesUpsell}
                      onChange={(e) => updateAVR("opportunitiesUpsell", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Process Improvements</Label>
                    <AvrPresetSelect
                      ariaLabel="Process improvement quick options"
                      options={AVR_OPPORTUNITY_PROCESS_PRESETS}
                      onSelect={(v) => updateAVR("opportunitiesProcess", v)}
                    />
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                      placeholder="SOP improvements, monitoring, communication…"
                      value={avrData.opportunitiesProcess}
                      onChange={(e) => updateAVR("opportunitiesProcess", e.target.value)}
                    />
                  </div>
                </div>
              </AVRSection>

              {/* Section 5: Action Items — each filled row creates a ticket on submit */}
              <AVRSection number={5} title="Action Items">
                <p className="text-xs text-slate-500 -mt-1 mb-3">
                  Rows with an <strong>item / request</strong> description create real tickets for this customer account (same lifecycle as Tickets). Empty rows are skipped.
                </p>
                <div className="space-y-4">
                  {avrData.actionItems.map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="space-y-1 min-w-[140px]">
                          <Label className="text-xs">Ticket category</Label>
                          <Select
                            value={item.category}
                            onChange={(e) => {
                              const cat = e.target.value as "request" | "complaint";
                              setAvrData((prev) => {
                                const items = [...prev.actionItems];
                                items[idx] = {
                                  ...items[idx],
                                  category: cat,
                                  requestType: cat === "complaint" ? "other" : "new_product_request",
                                };
                                return { ...prev, actionItems: items };
                              });
                            }}
                          >
                            <option value="request">Service request</option>
                            <option value="complaint">Complaint</option>
                          </Select>
                        </div>
                        <div className="space-y-1 min-w-[200px] flex-1">
                          <Label className="text-xs">Ticket type</Label>
                          <Select
                            value={item.requestType}
                            onChange={(e) => updateActionItem(idx, "requestType", e.target.value)}
                          >
                            {(item.category === "complaint" ? AVR_TICKET_COMPLAINT_TYPE_OPTIONS : AVR_TICKET_REQUEST_TYPE_OPTIONS).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Item / request <span className="text-red-500">*</span></Label>
                        <Input
                          placeholder="e.g. 10 × tablets for sales team"
                          value={item.item}
                          onChange={(e) => updateActionItem(idx, "item", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            placeholder="10"
                            inputMode="numeric"
                            value={item.quantity}
                            onChange={(e) => updateActionItem(idx, "quantity", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Target due date</Label>
                          <Input type="date" value={item.dueDate} onChange={(e) => updateActionItem(idx, "dueDate", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Internal owner</Label>
                          <Input
                            placeholder="Who follows up internally"
                            value={item.owner}
                            onChange={(e) => updateActionItem(idx, "owner", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                          <Label className="text-xs">Notes (optional)</Label>
                          <Input
                            placeholder="Extra detail for the ticket"
                            value={item.notes}
                            onChange={(e) => updateActionItem(idx, "notes", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeActionItem(idx)} disabled={avrData.actionItems.length <= 1}>
                          <Trash2 className="h-4 w-4 text-slate-400" /> Remove row
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addActionItem} className="flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add action item
                  </Button>
                </div>
              </AVRSection>

              {/* Section 6: Customer Feedback — visible after visit completion (post–control card & rating) */}
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-200 text-xs font-bold text-slate-500">6</span>
                  <span className="text-sm font-medium">Customer Feedback (Positives / Concerns)</span>
                  <Badge variant="neutral" className="ml-auto text-xs">Visible after completion</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-2 ml-8">This section will be available for review and input after the control card is submitted and the customer rating is captured.</p>
              </div>

              {/* Section 7: Overall Account Health — visible after visit completion */}
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-200 text-xs font-bold text-slate-500">7</span>
                  <span className="text-sm font-medium">Overall Account Health (Green / Amber / Red)</span>
                  <Badge variant="neutral" className="ml-auto text-xs">Visible after completion</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-2 ml-8">The account health assessment will be determined after the full visit report is reviewed and customer feedback is captured.</p>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  onClick={() => {
                    closeControlCardModal();
                    toast.info("Draft saved", { description: "You can resume when you reopen this visit’s control card." });
                  }}
                >
                  Save draft & close
                </Button>
                <Button onClick={handleSubmitControlCard} disabled={submittingControlCard}>
                  {submittingControlCard ? "Submitting..." : "Submit & Request Rating"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Reschedule Request Modal */}
      {rescheduleVisit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle className="text-lg">Request Reschedule — {rescheduleVisit.accountName}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setRescheduleVisit(null)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-slate-700">
                  This request will be sent to your <strong>Manager/Supervisor</strong> for approval before the reschedule is confirmed.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Original Visit Time</Label>
                <Input
                  readOnly
                  value={rescheduleVisit.visitDate === new Date().toISOString().split("T")[0]
                    ? `Today, ${rescheduleVisit.startTime}`
                    : `${rescheduleVisit.visitDate}, ${rescheduleVisit.startTime}`}
                  className="bg-slate-50 text-slate-600"
                />
              </div>

              <div className="space-y-2">
                <Label>Reason for Reschedule <span className="text-red-500">*</span></Label>
                <Select value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)}>
                  <option value="">Select reason...</option>
                  <option value="Customer requested reschedule">Customer requested reschedule</option>
                  <option value="Scheduling conflict">Scheduling conflict</option>
                  <option value="Executive unavailable">Executive unavailable</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Customer unavailable">Customer unavailable</option>
                  <option value="Other">Other</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Motivation <span className="text-red-500">*</span></Label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue resize-y"
                  placeholder="Explain why the customer is requesting the reschedule..."
                  value={rescheduleMotivation}
                  onChange={(e) => setRescheduleMotivation(e.target.value)}
                />
                <p className="text-xs text-slate-500">A detailed motivation is required for manager approval.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={rescheduleNewDate} onChange={(e) => setRescheduleNewDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>New Time <span className="text-red-500">*</span></Label>
                  <Input type="time" value={rescheduleNewTime} onChange={(e) => setRescheduleNewTime(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-200">
                <Button variant="outline" className="flex-1" onClick={() => setRescheduleVisit(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
                  onClick={handleSubmitReschedule}
                  disabled={rescheduleSubmitting}
                >
                  <Send className="h-4 w-4" />
                  {rescheduleSubmitting ? "Submitting..." : "Submit for Approval"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showViewCard && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 py-4">
              <CardTitle>Control Card — {showViewCard.corp}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowViewCard(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">Visit Date</span>
                  <span className="font-medium text-slate-900">{showViewCard.date}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Executive</span>
                  <span className="font-medium text-slate-900">{showViewCard.exec}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Engagement Type</span>
                  <span className="font-medium text-slate-900">{showViewCard.type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Customer Rating</span>
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-slate-900">{showViewCard.rating}/5</span>
                    <Star className={`h-4 w-4 ${showViewCard.rating >= 4 ? 'fill-blue-400 text-blue-400' : showViewCard.rating <= 2 ? 'fill-red-400 text-red-400' : 'fill-blue-300 text-blue-300'}`} />
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block mb-1">Product Areas</span>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="default">Fiber Internet</Badge>
                    <Badge variant="default">Cloud Services</Badge>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block mb-1">Next Action</span>
                  <span className="font-medium text-slate-900">Send Proposal — Due Nov 1, 2024</span>
                </div>
                {showViewCard.rating <= 2 && (
                  <div className="col-span-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                    <strong>Low Rating:</strong> Escalation was triggered to Supervisor and Management.
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setShowViewCard(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyData.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="font-medium text-slate-900">{row.corp}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.exec}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-blue-500">
                      <span className="font-semibold text-slate-800 mr-1">{row.rating}</span>
                      <Star className="h-4 w-4 fill-current" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setShowViewCard(row)}>View Card</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
