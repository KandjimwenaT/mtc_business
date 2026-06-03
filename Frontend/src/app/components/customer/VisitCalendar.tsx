import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  User,
  Video,
  CalendarClock,
  Star,
  FileText,
  Send,
  ClipboardList,
  ShieldAlert,
  TrendingUp,
  ListTodo,
  Sparkles,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { getCustomerVisits, respondToVisit, submitVisitRating, getControlCard, type VisitRecord, type ControlCardRecord } from '../../api/visitApi';
import { toast } from 'sonner';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, startOfMonth, endOfMonth } from 'date-fns';

function trimStr(v: unknown): string {
  return String(v ?? '').trim();
}

/** YYYY-MM-DD from API (handles DATEONLY strings or ISO datetimes). */
function visitDateCalendarDay(visit: VisitRecord): string {
  const raw = visit.visitDate;
  if (typeof raw !== 'string' || !raw) return '';
  return raw.slice(0, 10);
}

/** Local interpretation of scheduled visit start (for comparisons only). */
function visitScheduledStart(visit: VisitRecord): Date {
  const day = visitDateCalendarDay(visit);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date(NaN);
  let time = String(visit.startTime || '09:00').trim();
  if (/^\d{1,2}:\d{2}$/.test(time)) time = `${time}:00`;
  return new Date(`${day}T${time}`);
}

function isVisitScheduledStartInPast(visit: VisitRecord, now = new Date()): boolean {
  const t = visitScheduledStart(visit).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

/** Backend may emit camelCase or snake_case; coerce strings (e.g. "5"). */
function visitNumericRating(v: VisitRecord): number {
  const ext = v as unknown as Record<string, unknown>;
  const raw = ext.customerRating ?? ext.customer_rating;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function visitRatingComment(v: VisitRecord): string | null {
  const ext = v as unknown as Record<string, unknown>;
  const c = ext.customerRatingComment ?? ext.customer_rating_comment;
  return typeof c === 'string' && c.trim() ? c : null;
}

function visitRatedAtIso(v: VisitRecord): string | null {
  const ext = v as unknown as Record<string, unknown>;
  const r = ext.customerRatedAt ?? ext.customer_rated_at;
  if (typeof r === 'string') return r;
  if (r instanceof Date && !Number.isNaN(r.getTime())) return r.toISOString();
  return null;
}

/** True if the meeting report has any content worth showing the customer. */
function meetingReportHasCustomerVisibleContent(cc: ControlCardRecord | undefined): boolean {
  if (!cc) return false;
  const textFields = [
    cc.visitObjective,
    cc.csrManager,
    cc.customerParticipants,
    cc.slaCompliance,
    cc.openTickets,
    cc.criticalIncidents,
    cc.risksOperational,
    cc.risksCommercial,
    cc.risksCompetitive,
    cc.opportunitiesUpsell,
    cc.opportunitiesProcess,
    cc.accountHealth,
  ];
  if (textFields.some((x) => trimStr(x))) return true;
  const items = cc.actionItems;
  if (!Array.isArray(items)) return false;
  return items.some((row) =>
    ['item', 'action', 'quantity', 'dueDate', 'deadline', 'owner', 'notes', 'category', 'requestType'].some((k) =>
      trimStr((row as unknown as Record<string, unknown>)[k]),
    ),
  );
}

const accountHealthPresentation: Record<string, { label: string; className: string }> = {
  green: { label: 'Relationship: On track', className: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  amber: { label: 'Relationship: Needs attention', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  red: { label: 'Relationship: At risk', className: 'bg-red-50 text-red-900 border-red-200' },
};

function CustomerMeetingReportDetails({
  cc,
  visit,
  variant = 'default',
}: {
  cc: ControlCardRecord;
  visit?: VisitRecord | null;
  variant?: 'default' | 'embedded';
}) {
  const items = Array.isArray(cc.actionItems) ? cc.actionItems : [];
  const actionableRows = items.filter((row) =>
    trimStr(row.item || row.action || row.notes || row.owner || row.quantity || row.dueDate || row.deadline),
  );

  const outer =
    variant === 'embedded'
      ? 'rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden'
      : 'rounded-2xl border border-emerald-100/80 bg-gradient-to-b from-white via-slate-50/40 to-white shadow-sm overflow-hidden';

  const health = cc.accountHealth ? accountHealthPresentation[cc.accountHealth] : null;

  return (
    <div className={outer}>
      <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-600/90 to-teal-700/90 px-4 py-3 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
            <ClipboardList className="h-5 w-5 shrink-0" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">Account Visit Report</p>
            <p className="text-xs text-emerald-50/95 mt-0.5">
              Filed by {visit?.executiveName ?? 'your account executive'}
              {visit?.visitDate ? ` · ${format(new Date(visit.visitDate), 'MMM d, yyyy')}` : cc.visitDate ? ` · ${format(new Date(cc.visitDate), 'MMM d, yyyy')}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {health && (
          <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${health.className}`}>
            {health.label}
          </div>
        )}

        {(trimStr(cc.csrManager) || trimStr(cc.customerParticipants)) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {trimStr(cc.csrManager) && (
              <div className="flex gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <Users className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">CSR / coverage</p>
                  <p className="text-sm text-slate-800">{cc.csrManager}</p>
                </div>
              </div>
            )}
            {trimStr(cc.customerParticipants) && (
              <div className="flex gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <Users className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Participants noted</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{cc.customerParticipants}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {trimStr(cc.visitObjective) && (
          <div className="rounded-xl bg-white border border-slate-100 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700 mb-2">
              <FileText className="h-4 w-4 text-emerald-600" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider">Meeting summary</span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{cc.visitObjective}</p>
          </div>
        )}

        {(trimStr(cc.slaCompliance) || trimStr(cc.openTickets) || trimStr(cc.criticalIncidents)) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider">Service &amp; incidents</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-1">
              {trimStr(cc.slaCompliance) && (
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">SLA / commitments</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.slaCompliance}</p>
                </div>
              )}
              {trimStr(cc.openTickets) && (
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Open tickets</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.openTickets}</p>
                </div>
              )}
              {trimStr(cc.criticalIncidents) && (
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Critical incidents</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.criticalIncidents}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {(trimStr(cc.risksOperational) || trimStr(cc.risksCommercial) || trimStr(cc.risksCompetitive)) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <TrendingUp className="h-4 w-4 text-slate-600 rotate-[-8deg]" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider">Risks &amp; themes discussed</span>
            </div>
            <div className="space-y-2">
              {trimStr(cc.risksOperational) && (
                <div className="rounded-lg border border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Operational</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.risksOperational}</p>
                </div>
              )}
              {trimStr(cc.risksCommercial) && (
                <div className="rounded-lg border border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Commercial</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.risksCommercial}</p>
                </div>
              )}
              {trimStr(cc.risksCompetitive) && (
                <div className="rounded-lg border border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Competitive</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.risksCompetitive}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {(trimStr(cc.opportunitiesUpsell) || trimStr(cc.opportunitiesProcess)) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider">Opportunities</span>
            </div>
            <div className="space-y-2">
              {trimStr(cc.opportunitiesUpsell) && (
                <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2">
                  <p className="text-[11px] font-semibold text-violet-800 uppercase tracking-wider">Growth / upsell</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.opportunitiesUpsell}</p>
                </div>
              )}
              {trimStr(cc.opportunitiesProcess) && (
                <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2">
                  <p className="text-[11px] font-semibold text-violet-800 uppercase tracking-wider">Process improvements</p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{cc.opportunitiesProcess}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {actionableRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <ListTodo className="h-4 w-4 text-blue-600" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider">Agreed follow-ups</span>
            </div>
            <ul className="space-y-2">
              {actionableRows.map((row, i) => {
                const title = trimStr(row.item || row.action) || `Action ${i + 1}`;
                const meta = [row.quantity && `Qty: ${row.quantity}`, row.dueDate || row.deadline, row.owner]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li
                    key={`${title}-${i}`}
                    className="rounded-lg border border-blue-100/80 bg-blue-50/30 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-slate-900">{title}</p>
                    {meta && <p className="text-xs text-slate-600 mt-1">{meta}</p>}
                    {trimStr(row.notes) && <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap border-t border-blue-100/60 pt-2">{row.notes}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}

function StarDisplay({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  return (
    <div className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${cls} ${star <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
        />
      ))}
    </div>
  );
}

function visitMeetingReportEligible(status: VisitRecord['status']) {
  return status === 'completed' || status === 'follow_up_pending';
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending Approval', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30 border-l-2 border-amber-500' },
  approved: { label: 'Approved', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30 border-l-2 border-blue-500' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30 border-l-2 border-green-500' },
  declined: { label: 'Declined', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30 border-l-2 border-red-500' },
  completed: { label: 'Completed', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800 border-l-2 border-gray-500' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900 border-l-2 border-gray-400' },
  rescheduled: { label: 'Rescheduled', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30 border-l-2 border-purple-500' },
  follow_up_pending: {
    label: 'Report filed — awaiting closure',
    color: 'text-amber-700',
    bg: 'bg-amber-100 dark:bg-amber-900/30 border-l-2 border-amber-500',
  },
};

function getPastVisitBadgeVariant(status: string): 'outline' | 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'pending':
      return 'outline';
    case 'approved':
      return 'default';
    case 'confirmed':
      return 'default';
    case 'follow_up_pending':
      return 'secondary';
    case 'completed':
      return 'secondary';
    default:
      return 'outline';
  }
}

function PastVisitReviewCard({
  visit,
  defaultOpen,
  controlCards,
  isOverdueVisit,
  onRateNow,
}: {
  visit: VisitRecord;
  defaultOpen: boolean;
  controlCards: Record<number, ControlCardRecord>;
  isOverdueVisit: (v: VisitRecord) => boolean;
  onRateNow: (v: VisitRecord) => void;
}) {
  const cc = controlCards[visit.visitId];
  const hasReportOnFile = Boolean(cc);
  const ratingScore = visitNumericRating(visit);
  const rated = ratingScore > 0;
  const ratedAt = visitRatedAtIso(visit);
  const ratingComment = visitRatingComment(visit);

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Card className="border-slate-200 overflow-hidden shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left bg-slate-50/80 hover:bg-slate-100/80 transition-colors border-b border-slate-100 [&[data-state=open]_svg]:rotate-180">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-slate-900">{visit.purpose}</h4>
            <p className="text-sm text-slate-500 mt-1">
              {format(new Date(visit.visitDate), 'EEE, MMM d, yyyy')} · {visit.startTime} – {visit.endTime}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{visit.executiveName}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {isOverdueVisit(visit) ? (
                <Badge variant="destructive">Overdue</Badge>
              ) : (
                <Badge variant={getPastVisitBadgeVariant(visit.status)}>
                  {statusConfig[visit.status]?.label ?? visit.status}
                </Badge>
              )}
              {visitMeetingReportEligible(visit.status) && (
                <>
                  {hasReportOnFile ? (
                    <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-900 font-normal">
                      Meeting report on file
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-600 font-normal border-slate-200">
                      Report not filed yet
                    </Badge>
                  )}
                </>
              )}
              {rated ? (
                <span className="inline-flex items-center gap-1 text-xs text-amber-800 font-medium">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
                  Your rating: {ratingScore}/5
                </span>
              ) : visitMeetingReportEligible(visit.status) && hasReportOnFile ? (
                <Badge className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50 font-normal">Awaiting your rating</Badge>
              ) : null}
            </div>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-0">
            <div className="mx-4 mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100">
                <User className="h-5 w-5 text-teal-800" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Visit hosted by</p>
                <p className="font-semibold text-slate-900">{visit.executiveName}</p>
                {visit.executiveEmail ? (
                  <a
                    href={`mailto:${visit.executiveEmail}`}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-0.5"
                  >
                    <Mail className="h-3 w-3 shrink-0" aria-hidden />
                    {visit.executiveEmail}
                  </a>
                ) : null}
              </div>
            </div>
            {visit.agenda && (
              <div className="mx-4 mt-4 rounded-xl border border-slate-100 bg-white px-4 py-3">
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Agenda:</span> {visit.agenda}
                </p>
              </div>
            )}
            {visitMeetingReportEligible(visit.status) && cc && (
              <div className="p-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Meeting report</p>
                {meetingReportHasCustomerVisibleContent(cc) ? (
                  <CustomerMeetingReportDetails cc={cc} visit={visit} variant="embedded" />
                ) : (
                  <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 px-4 py-3">
                    No meeting-report fields have been shared with you for this visit yet.
                  </p>
                )}
              </div>
            )}
            {visitMeetingReportEligible(visit.status) && !cc && (
              <div className="p-4 border-b border-slate-100 text-sm text-slate-500">
                Meeting notes are not available yet for this visit.
              </div>
            )}
            <div className="p-4 bg-amber-50/40 border-t border-amber-100/60">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Your rating</p>
              {rated ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <StarDisplay value={ratingScore} size="sm" />
                    <span className="text-sm font-medium text-slate-800">{ratingScore} / 5</span>
                    {ratedAt && (
                      <span className="text-xs text-slate-500">{format(new Date(ratedAt), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                  {ratingComment && (
                    <p className="text-sm text-slate-700">&ldquo;{ratingComment}&rdquo;</p>
                  )}
                </div>
              ) : visitMeetingReportEligible(visit.status) && controlCards[visit.visitId] ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                  <span className="text-sm text-slate-600">You have not rated this visit yet.</span>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRateNow(visit);
                    }}
                  >
                    Rate now
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-slate-500">
                  {visitMeetingReportEligible(visit.status)
                    ? 'You can rate after your executive files the meeting report.'
                    : 'Ratings are available after your meeting report is submitted.'}
                </span>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function VisitCalendar() {
  const [visitSectionTab, setVisitSectionTab] = useState<'calendar' | 'previous'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<VisitRecord | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [ratingVisit, setRatingVisit] = useState<VisitRecord | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [controlCards, setControlCards] = useState<Record<number, ControlCardRecord>>({});

  const fetchVisits = async () => {
    try {
      setLoading(true);
      const data = await getCustomerVisits();
      setVisits(data);
      // Control cards once the executive has submitted the meeting report (rating + customer UI)
      const reportVisits = data.filter((v) => visitMeetingReportEligible(v.status));
      const cards: Record<number, ControlCardRecord> = {};
      await Promise.all(
        reportVisits.map(async (v) => {
          try {
            const card = await getControlCard(v.visitId);
            cards[v.visitId] = card;
          } catch {
            /* no control card yet */
          }
        }),
      );
      setControlCards(cards);
    } catch (err: unknown) {
      toast.error('Failed to load visits', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVisits(); }, []);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getVisitsForDate = (date: Date) => {
    return visits.filter(visit => isSameDay(new Date(visit.visitDate), date));
  };

  const navigatePrev = () => {
    setCurrentDate(view === 'week' ? addDays(currentDate, -7) : addMonths(currentDate, -1));
  };

  const navigateNext = () => {
    setCurrentDate(view === 'week' ? addDays(currentDate, 7) : addMonths(currentDate, 1));
  };

  const pendingVisits = visits.filter(v => v.status === 'pending');
  const upcomingVisits = visits.filter(v => ['approved', 'confirmed'].includes(v.status));
  const isOverdueVisit = (visit: VisitRecord) => {
    return (
      isVisitScheduledStartInPast(visit) &&
      ['pending', 'approved', 'confirmed', 'rescheduled'].includes(visit.status)
    );
  };

  const meetingHistoryVisits = useMemo(() => {
    const now = new Date();
    return visits
      .filter((v) => {
        // Rated visits always appear in history (avoid hiding due to date quirks / timezone).
        if (visitNumericRating(v) > 0) return true;
        return visitMeetingReportEligible(v.status) && isVisitScheduledStartInPast(v, now);
      })
      .sort(
        (a, b) =>
          visitScheduledStart(b).getTime() - visitScheduledStart(a).getTime(),
      );
  }, [visits]);

  const otherPastVisits = useMemo(() => {
    const now = new Date();
    return visits
      .filter(
        (v) =>
          isVisitScheduledStartInPast(v, now) &&
          !visitMeetingReportEligible(v.status) &&
          visitNumericRating(v) === 0,
      )
      .sort(
        (a, b) =>
          visitScheduledStart(b).getTime() - visitScheduledStart(a).getTime(),
      );
  }, [visits]);

  const meetingHistoryReportCount = useMemo(
    () => meetingHistoryVisits.filter((v) => controlCards[v.visitId]).length,
    [meetingHistoryVisits, controlCards],
  );

  const meetingHistoryRatedCount = useMemo(
    () => meetingHistoryVisits.filter((v) => visitNumericRating(v) > 0).length,
    [meetingHistoryVisits],
  );

  const meetingHistoryAwaitingRating = useMemo(
    () =>
      meetingHistoryVisits.filter(
        (v) => controlCards[v.visitId] && visitNumericRating(v) === 0,
      ).length,
    [meetingHistoryVisits, controlCards],
  );

  const overduePastCount = useMemo(() => {
    return [...meetingHistoryVisits, ...otherPastVisits].filter((visit) => {
      return (
        isVisitScheduledStartInPast(visit) &&
        ['pending', 'approved', 'confirmed', 'rescheduled'].includes(visit.status)
      );
    }).length;
  }, [meetingHistoryVisits, otherPastVisits]);
  const completedAwaitingRating = visits.filter(
    (v) =>
      visitMeetingReportEligible(v.status) &&
      controlCards[v.visitId] &&
      visitNumericRating(v) === 0,
  );

  useEffect(() => {
    const now = new Date();
    visits.forEach((visit) => {
      const start = visitScheduledStart(visit);
      if (!Number.isFinite(start.getTime())) return;
      const hoursToStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
      const reminderKey = `customer_visit_reminder_seen_${visit.visitId}_${visit.visitDate}`;
      const overdueKey = `customer_visit_overdue_seen_${visit.visitId}_${visit.visitDate}`;

      if (hoursToStart > 0 && hoursToStart <= 24 && !localStorage.getItem(reminderKey)) {
        toast.info('Upcoming visit reminder', {
          description: `${visit.purpose} is scheduled for ${visit.visitDate} at ${visit.startTime}.`,
        });
        localStorage.setItem(reminderKey, '1');
      }

      if (isOverdueVisit(visit) && !localStorage.getItem(overdueKey)) {
        toast.warning('Visit overdue', {
          description: `${visit.purpose} was not started and is now overdue.`,
        });
        localStorage.setItem(overdueKey, '1');
      }
    });
  }, [visits]);

  const handleApprove = async (visitId: number) => {
    try {
      await respondToVisit(visitId, { action: 'approve' });
      setSelectedVisit(null);
      toast.success('Visit approved', {
        description: 'The executive has been notified of your approval.',
      });
      await fetchVisits();
    } catch (err: unknown) {
      toast.error('Failed to approve', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleDecline = async (visitId: number) => {
    if (!declineReason.trim()) {
      toast.error('Please provide a reason for declining.');
      return;
    }
    try {
      await respondToVisit(visitId, { action: 'decline', customerResponse: declineReason });
      setSelectedVisit(null);
      setShowDeclineForm(false);
      setDeclineReason('');
      toast.info('Visit declined', {
        description: 'The executive has been notified. They may propose a new date.',
      });
      await fetchVisits();
    } catch (err: unknown) {
      toast.error('Failed to decline', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleReschedule = async (visitId: number) => {
    if (!rescheduleDate || !rescheduleStartTime || !rescheduleEndTime) {
      toast.error('Please fill in the proposed date and times.');
      return;
    }
    try {
      await respondToVisit(visitId, {
        action: 'reschedule',
        rescheduleDate,
        rescheduleStartTime,
        rescheduleEndTime,
        rescheduleReason: rescheduleReason || undefined,
      });
      setSelectedVisit(null);
      setShowRescheduleForm(false);
      setRescheduleDate('');
      setRescheduleStartTime('');
      setRescheduleEndTime('');
      setRescheduleReason('');
      toast.info('Reschedule proposed', {
        description: 'The executive has been notified of your proposed time.',
      });
      await fetchVisits();
    } catch (err: unknown) {
      toast.error('Failed to reschedule', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending': return 'outline' as const;
      case 'approved': return 'default' as const;
      case 'confirmed': return 'default' as const;
      case 'follow_up_pending': return 'secondary' as const;
      case 'completed': return 'secondary' as const;
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingVisit || ratingValue === 0) {
      toast.error('Please select a star rating.');
      return;
    }
    try {
      setSubmittingRating(true);
      await submitVisitRating(ratingVisit.visitId, {
        rating: ratingValue,
        comment: ratingComment || undefined,
      });
      setRatingVisit(null);
      setRatingValue(0);
      setRatingHover(0);
      setRatingComment('');
      toast.success('Thank you for your feedback!', {
        description: `Your ${ratingValue}/5 rating has been recorded.`,
      });
      await fetchVisits();
    } catch (err: unknown) {
      toast.error('Failed to submit rating', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmittingRating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Visit Calendar</h1>
        <p className="text-sm text-slate-500">View and approve visit requests from your account executive.</p>
      </div>

      <Tabs
        value={visitSectionTab}
        onValueChange={(v) => setVisitSectionTab(v as 'calendar' | 'previous')}
        className="w-full"
      >
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex h-auto min-h-10 p-1 gap-1">
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="h-4 w-4 shrink-0" />
            Calendar &amp; upcoming
          </TabsTrigger>
          <TabsTrigger value="previous" className="gap-1.5">
            <Clock className="h-4 w-4 shrink-0" />
            Previous visits
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-6 mt-4">
      {loading && (
        <div className="py-8 text-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-lg">Loading visits…</div>
      )}

      {/* Pending Approval Banner */}
      {pendingVisits.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
              <Clock className="h-5 w-5" />
              Pending Visit Requests ({pendingVisits.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingVisits.map(visit => (
                <div key={visit.visitId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-white border border-amber-100">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900">{visit.purpose}</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(visit.visitDate), 'EEE, MMM d, yyyy')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {visit.startTime} - {visit.endTime}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {visit.executiveName}
                      </span>
                      <span className="flex items-center gap-1">
                        {visit.meetingType === 'online' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                        {visit.meetingType === 'online' ? 'Online' : (visit.location || 'In Person')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedVisit(visit); setShowDeclineForm(false); setShowRescheduleForm(false); }}
                    >
                      View Details
                    </Button>
                    {visit.execRescheduleStatus === 'pending_approval' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Reschedule Pending
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApprove(visit.visitId)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Executive Reschedule Requests Banner */}
      {visits.filter(v => v.execRescheduleStatus === 'pending_approval').length > 0 && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-purple-800">
              <CalendarClock className="h-5 w-5" />
              Executive Reschedule Requests ({visits.filter(v => v.execRescheduleStatus === 'pending_approval').length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {visits.filter(v => v.execRescheduleStatus === 'pending_approval').map(visit => (
                <div key={visit.visitId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-white border border-purple-100">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-900">{visit.purpose}</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {visit.executiveName}
                      </span>
                      <span className="flex items-center gap-1 line-through text-slate-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(visit.visitDate), 'EEE, MMM d')} {visit.startTime}
                      </span>
                      {visit.execRescheduleNewDate && (
                        <span className="flex items-center gap-1 font-medium text-purple-700">
                          <Calendar className="h-3.5 w-3.5" />
                          Proposed: {visit.execRescheduleNewDate} {visit.execRescheduleNewTime || ''}
                        </span>
                      )}
                    </div>
                    {visit.execRescheduleReason && (
                      <p className="text-sm text-slate-600 mt-1"><strong>Reason:</strong> {visit.execRescheduleReason}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedVisit(visit); setShowDeclineForm(false); setShowRescheduleForm(false); }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visit Detail Modal */}
      {selectedVisit && (
        <Card className="border-slate-300 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{selectedVisit.purpose}</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Requested by {selectedVisit.executiveName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getBadgeVariant(selectedVisit.status)}>
                  {statusConfig[selectedVisit.status]?.label ?? selectedVisit.status}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedVisit(null); setShowDeclineForm(false); setShowRescheduleForm(false); }}>
                  ✕
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 mb-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Date</p>
                    <p className="text-sm text-slate-500">{format(new Date(selectedVisit.visitDate), 'EEEE, MMMM d, yyyy')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Time</p>
                    <p className="text-sm text-slate-500">{selectedVisit.startTime} - {selectedVisit.endTime}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  {selectedVisit.meetingType === 'online' ? <Video className="h-4 w-4 text-slate-400 mt-0.5" /> : <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />}
                  <div>
                    <p className="text-sm font-medium text-slate-700">{selectedVisit.meetingType === 'online' ? 'Online Meeting' : 'Location'}</p>
                    <p className="text-sm text-slate-500">
                      {selectedVisit.meetingType === 'online'
                        ? (selectedVisit.onlineLink || 'Link will be shared')
                        : (selectedVisit.location || 'TBD')}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Account Executive</p>
                    <p className="text-sm text-slate-500">{selectedVisit.executiveName}</p>
                    <p className="text-xs text-slate-400">{selectedVisit.executiveEmail}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Attendees</p>
                    <p className="text-sm text-slate-500">{selectedVisit.attendees?.length > 0 ? selectedVisit.attendees.join(', ') : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
            {selectedVisit.agenda && (
              <div className="rounded-lg bg-slate-50 p-3 mb-4">
                <p className="text-sm font-medium text-slate-700 mb-1">Agenda</p>
                <p className="text-sm text-slate-600">{selectedVisit.agenda}</p>
              </div>
            )}

            {/* Executive Reschedule Request Notice */}
            {selectedVisit.execRescheduleStatus === 'pending_approval' && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <CalendarClock className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-purple-800 text-sm">Executive Requested Reschedule</h4>
                    <p className="text-sm text-purple-700 mt-1">
                      {selectedVisit.executiveName} has requested to reschedule this visit.
                    </p>
                    {selectedVisit.execRescheduleReason && (
                      <p className="text-sm text-slate-600 mt-2"><strong>Reason:</strong> {selectedVisit.execRescheduleReason}</p>
                    )}
                    {selectedVisit.execRescheduleNewDate && (
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span className="text-slate-500 line-through">Original: {format(new Date(selectedVisit.visitDate), 'EEE, MMM d')} {selectedVisit.startTime}</span>
                        <span className="font-medium text-purple-700">Proposed: {selectedVisit.execRescheduleNewDate} {selectedVisit.execRescheduleNewTime || ''}</span>
                      </div>
                    )}
                    <p className="text-xs text-purple-500 mt-2">This reschedule is awaiting manager approval.</p>
                  </div>
                </div>
              </div>
            )}

            {selectedVisit.status === 'pending' && selectedVisit.execRescheduleStatus !== 'pending_approval' && (
              <>
                {!showDeclineForm && !showRescheduleForm ? (
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:gap-3">
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white sm:flex-1"
                      onClick={() => handleApprove(selectedVisit.visitId)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Visit
                    </Button>
                    <Button
                      variant="outline"
                      className="border-purple-200 text-purple-600 hover:bg-purple-50 sm:flex-1"
                      onClick={() => setShowRescheduleForm(true)}
                    >
                      <CalendarClock className="h-4 w-4 mr-2" />
                      Reschedule
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 sm:flex-1"
                      onClick={() => setShowDeclineForm(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                ) : showDeclineForm ? (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Reason for declining</label>
                      <textarea
                        className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        rows={3}
                        placeholder="Please provide a reason so the executive can propose a better time..."
                        value={declineReason}
                        onChange={e => setDeclineReason(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50 flex-1"
                        onClick={() => handleDecline(selectedVisit.visitId)}
                      >
                        Confirm Decline
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setShowDeclineForm(false); setDeclineReason(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <p className="text-sm font-medium text-slate-700">Propose a new date & time</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-slate-500">Date</label>
                        <input
                          type="date"
                          className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          value={rescheduleDate}
                          onChange={e => setRescheduleDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Start Time</label>
                        <input
                          type="time"
                          className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          value={rescheduleStartTime}
                          onChange={e => setRescheduleStartTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">End Time</label>
                        <input
                          type="time"
                          className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          value={rescheduleEndTime}
                          onChange={e => setRescheduleEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Reason (optional)</label>
                      <textarea
                        className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        rows={2}
                        placeholder="Let the executive know why you'd like to reschedule..."
                        value={rescheduleReason}
                        onChange={e => setRescheduleReason(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        className="bg-purple-600 hover:bg-purple-700 text-white flex-1"
                        onClick={() => handleReschedule(selectedVisit.visitId)}
                      >
                        Propose Reschedule
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setShowRescheduleForm(false); setRescheduleDate(''); setRescheduleStartTime(''); setRescheduleEndTime(''); setRescheduleReason(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calendar Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-xl">
              {format(currentDate, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <Tabs value={view} onValueChange={(v) => setView(v as 'week' | 'month')}>
                <TabsList>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={navigatePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={navigateNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'week' ? (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="grid grid-cols-7 gap-2 min-w-[560px]">
              {weekDays.map((day, index) => {
                const dayVisits = getVisitsForDate(day);
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={index}
                    className={`min-h-32 p-3 rounded-lg border ${isToday ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'}`}
                  >
                    <div className="font-semibold mb-2">
                      <div className="text-xs text-slate-500">{format(day, 'EEE')}</div>
                      <div className={`text-sm ${isToday ? 'text-blue-600' : 'text-slate-900'}`}>{format(day, 'd')}</div>
                    </div>
                    <div className="space-y-1.5">
                      {dayVisits.map(visit => (
                        <button
                          key={visit.visitId}
                          onClick={() => { setSelectedVisit(visit); setShowDeclineForm(false); setShowRescheduleForm(false); }}
                          className={`w-full text-left p-1.5 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity ${statusConfig[visit.status]?.bg ?? 'bg-gray-100'}`}
                        >
                          <div className="font-medium truncate">{visit.purpose}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            {visit.meetingType === 'online' ? <Video className="h-2.5 w-2.5" /> : <MapPin className="h-2.5 w-2.5" />}
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
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, index) => {
                  const dayVisits = getVisitsForDate(day);
                  const isToday = isSameDay(day, new Date());
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  return (
                    <div
                      key={index}
                      className={`min-h-24 p-2 rounded-lg border ${isToday ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'} ${!isCurrentMonth ? 'opacity-40' : ''}`}
                    >
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1">
                        {dayVisits.slice(0, 2).map(visit => (
                          <button
                            key={visit.visitId}
                            onClick={() => { setSelectedVisit(visit); setShowDeclineForm(false); setShowRescheduleForm(false); }}
                            className={`w-full text-left px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:opacity-80 ${statusConfig[visit.status]?.bg ?? 'bg-gray-100'}`}
                          >
                            {visit.purpose}
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

      {/* Upcoming Approved Visits */}
      {upcomingVisits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingVisits.map(visit => (
                <div key={visit.visitId} className="flex items-start gap-4 p-4 rounded-lg border border-slate-200">
                  <div className="p-2.5 rounded-lg bg-blue-100">
                    {visit.meetingType === 'online' ? <Video className="h-5 w-5 text-blue-600" /> : <Calendar className="h-5 w-5 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-slate-900">{visit.purpose}</h4>
                      <Badge variant={getBadgeVariant(visit.status)}>
                        {statusConfig[visit.status]?.label ?? visit.status}
                      </Badge>
                    </div>
                    {visit.agenda && <p className="text-sm text-slate-500 mb-2">{visit.agenda}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(visit.visitDate), 'EEE, MMM d')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {visit.startTime} - {visit.endTime}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {visit.meetingType === 'online' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                        {visit.meetingType === 'online' ? 'Online' : (visit.location || 'In Person')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        {visit.executiveName}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Visits Awaiting Rating */}
      {completedAwaitingRating.length > 0 && (
        <Card className="border-emerald-200/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex flex-wrap items-center gap-2 text-emerald-900">
              <FileText className="h-5 w-5 shrink-0" />
              Meeting reports — rate your visit ({completedAwaitingRating.length})
            </CardTitle>
            <p className="text-sm text-emerald-800/80 font-normal pt-1">
              Review the full report below, then tap Rate to share feedback on how the meeting went.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {completedAwaitingRating.map(visit => {
                const cc = controlCards[visit.visitId];
                return (
                  <div
                    key={visit.visitId}
                    className="rounded-2xl bg-white border border-emerald-100 overflow-hidden shadow-sm ring-1 ring-emerald-500/10"
                  >
                    <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-900 text-lg">{visit.purpose}</h4>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              {format(new Date(visit.visitDate), 'EEE, MMM d, yyyy')}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {visit.startTime} – {visit.endTime}
                            </span>
                          </div>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200 w-fit">
                          Awaiting your rating
                        </Badge>
                      </div>
                      <div className="mt-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100">
                          <User className="h-5 w-5 text-teal-800" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Your visitor</p>
                          <p className="font-semibold text-slate-900">{visit.executiveName}</p>
                          {visit.executiveEmail ? (
                            <a
                              href={`mailto:${visit.executiveEmail}`}
                              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-0.5"
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              {visit.executiveEmail}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {cc && (
                      <div className="p-4 sm:p-5 bg-slate-50/30">
                        {meetingReportHasCustomerVisibleContent(cc) ? (
                          <CustomerMeetingReportDetails cc={cc} visit={visit} />
                        ) : (
                          <p className="text-sm text-slate-600 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3">
                            Your executive filed the meeting report, but no fields were filled in for your review yet. You can still submit your rating below.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="p-4 sm:p-5 bg-white border-t border-slate-100">
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 text-base shadow-sm"
                        onClick={() => { setRatingVisit(visit); setRatingValue(0); setRatingHover(0); setRatingComment(''); }}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Rate this visit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pending Approval</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Approved</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Rescheduled</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-500" /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Declined</span>
      </div>
        </TabsContent>

        <TabsContent value="previous" className="space-y-4 mt-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-lg bg-slate-50/40">
              Loading your visits…
            </div>
          ) : (
            <>
              <Card className="border-teal-200/90 bg-gradient-to-br from-teal-50/50 via-white to-slate-50/90 shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl text-slate-900">Meeting reports &amp; your ratings</CardTitle>
                      <p className="text-sm text-slate-600 font-normal mt-1.5 max-w-2xl">
                        Past meetings your executive filed reports for, plus stars and comments you submitted—expand any row to review the full meeting summary.
                      </p>
                    </div>
                    {overduePastCount > 0 && (
                      <Badge variant="destructive" className="shrink-0">
                        {overduePastCount} overdue visit{overduePastCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  {meetingHistoryVisits.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-4">
                      <Badge variant="secondary" className="font-normal bg-white/90 border-teal-100">
                        {meetingHistoryReportCount} meeting report{meetingHistoryReportCount !== 1 ? 's' : ''} on file
                      </Badge>
                      <Badge variant="secondary" className="font-normal bg-white/90 border-teal-100">
                        {meetingHistoryRatedCount} rated by you
                      </Badge>
                      {meetingHistoryAwaitingRating > 0 && (
                        <Badge className="font-normal border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-50">
                          {meetingHistoryAwaitingRating} awaiting your rating
                        </Badge>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {meetingHistoryVisits.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center">
                      <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" aria-hidden />
                      <p className="text-sm font-medium text-slate-800">No meeting history yet</p>
                      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                        When a visit is completed and your executive submits an account visit report—or after you leave a rating—it will show here so you can review it anytime.
                      </p>
                    </div>
                  ) : (
                    meetingHistoryVisits.map((visit, idx) => (
                      <PastVisitReviewCard
                        key={visit.visitId}
                        visit={visit}
                        defaultOpen={idx === 0}
                        controlCards={controlCards}
                        isOverdueVisit={isOverdueVisit}
                        onRateNow={(v) => {
                          setVisitSectionTab('calendar');
                          setRatingVisit(v);
                          setRatingValue(0);
                          setRatingHover(0);
                          setRatingComment('');
                        }}
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              {otherPastVisits.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Other past visits</CardTitle>
                    <p className="text-sm text-slate-500 font-normal">
                      Visits that ended without a completed meeting report on file (for example declined, cancelled, or still pending action).
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {otherPastVisits.map((visit) => (
                      <PastVisitReviewCard
                        key={visit.visitId}
                        visit={visit}
                        defaultOpen={false}
                        controlCards={controlCards}
                        isOverdueVisit={isOverdueVisit}
                        onRateNow={(v) => {
                          setVisitSectionTab('calendar');
                          setRatingVisit(v);
                          setRatingValue(0);
                          setRatingHover(0);
                          setRatingComment('');
                        }}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Rating Modal */}
      {ratingVisit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl border-slate-200/80 overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-200 shrink-0 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-lg sm:text-xl">Rate your visit</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">
                    {ratingVisit.purpose} · {format(new Date(ratingVisit.visitDate), 'MMM d, yyyy')} · {ratingVisit.executiveName}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setRatingVisit(null)} aria-label="Close">
                  ✕
                </Button>
              </div>
            </CardHeader>
            <div className="flex-1 min-h-0 overflow-y-auto max-h-[min(70vh,calc(92vh-11rem))]">
              <CardContent className="pt-5 pb-6 space-y-6 px-4 sm:px-6">
                {controlCards[ratingVisit.visitId] ? (
                  meetingReportHasCustomerVisibleContent(controlCards[ratingVisit.visitId]) ? (
                    <CustomerMeetingReportDetails cc={controlCards[ratingVisit.visitId]} visit={ratingVisit} variant="embedded" />
                  ) : (
                    <p className="text-sm text-slate-600 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
                      The meeting report is on file but no shared fields were filled in. You can still rate your overall experience.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-slate-600 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
                    Loading meeting report… If this persists, refresh the page.
                  </p>
                )}

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-medium text-slate-800 mb-3 text-center">How was your experience?</p>
                  <div className="flex justify-center gap-2 sm:gap-3">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md p-1 transition-transform hover:scale-110"
                        onMouseEnter={() => setRatingHover(star)}
                        onMouseLeave={() => setRatingHover(0)}
                        onClick={() => setRatingValue(star)}
                      >
                        <Star
                          className={`h-9 w-9 sm:h-10 sm:w-10 ${(ratingHover || ratingValue) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                        />
                      </button>
                    ))}
                  </div>
                  {ratingValue > 0 && (
                    <p className="text-sm text-slate-500 mt-3 text-center">
                      {ratingValue <= 2 ? 'We\'re sorry to hear that' : ratingValue <= 3 ? 'Average' : ratingValue === 4 ? 'Good experience!' : 'Excellent!'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Additional comments (optional)</label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    rows={3}
                    placeholder="Tell us more about your experience…"
                    value={ratingComment}
                    onChange={e => setRatingComment(e.target.value)}
                  />
                </div>
              </CardContent>
            </div>
            <div className="border-t border-slate-200 bg-slate-50/80 p-4 shrink-0 flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSubmitRating}
                disabled={ratingValue === 0 || submittingRating}
              >
                <Send className="h-4 w-4 mr-2" />
                {submittingRating ? 'Submitting…' : 'Submit rating'}
              </Button>
              <Button variant="outline" className="flex-1 bg-white" onClick={() => setRatingVisit(null)}>
                Maybe later
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
