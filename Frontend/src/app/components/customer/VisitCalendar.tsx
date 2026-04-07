import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, MapPin, Clock, Users, CheckCircle, XCircle, User, Video, CalendarClock, Star, FileText, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { getCustomerVisits, respondToVisit, submitVisitRating, getControlCard, type VisitRecord, type ControlCardRecord } from '../../api/visitApi';
import { toast } from 'sonner';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, startOfMonth, endOfMonth } from 'date-fns';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending Approval', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30 border-l-2 border-amber-500' },
  approved: { label: 'Approved', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30 border-l-2 border-blue-500' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30 border-l-2 border-green-500' },
  declined: { label: 'Declined', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30 border-l-2 border-red-500' },
  completed: { label: 'Completed', color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-800 border-l-2 border-gray-500' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900 border-l-2 border-gray-400' },
  rescheduled: { label: 'Rescheduled', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30 border-l-2 border-purple-500' },
};

export function VisitCalendar() {
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
      // Fetch control cards for completed visits
      const completed = data.filter(v => v.status === 'completed' && !v.customerRating);
      const cards: Record<number, ControlCardRecord> = {};
      await Promise.all(completed.map(async (v) => {
        try {
          const card = await getControlCard(v.visitId);
          cards[v.visitId] = card;
        } catch { /* no control card yet */ }
      }));
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
    const start = new Date(`${visit.visitDate}T${visit.startTime}`);
    return start < new Date() && ['pending', 'approved', 'confirmed', 'rescheduled'].includes(visit.status);
  };
  const previousVisits = visits
    .filter(v => new Date(`${v.visitDate}T${v.startTime}`) < new Date())
    .sort((a, b) => new Date(`${b.visitDate}T${b.startTime}`).getTime() - new Date(`${a.visitDate}T${a.startTime}`).getTime());
  const completedAwaitingRating = visits.filter(v => v.status === 'completed' && controlCards[v.visitId] && !v.customerRating);
  const ratedVisits = visits.filter(v => v.status === 'completed' && v.customerRating);

  useEffect(() => {
    const now = new Date();
    visits.forEach((visit) => {
      const start = new Date(`${visit.visitDate}T${visit.startTime}`);
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
      case 'declined': return 'destructive' as const;
      default: return 'secondary' as const;
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
                  <div className="flex gap-3 pt-2">
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white flex-1"
                      onClick={() => handleApprove(selectedVisit.visitId)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Visit
                    </Button>
                    <Button
                      variant="outline"
                      className="border-purple-200 text-purple-600 hover:bg-purple-50 flex-1"
                      onClick={() => setShowRescheduleForm(true)}
                    >
                      <CalendarClock className="h-4 w-4 mr-2" />
                      Reschedule
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 flex-1"
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
                    <div className="grid grid-cols-3 gap-3">
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
            <div className="flex items-center gap-4">
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
            <div className="grid grid-cols-7 gap-2">
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
          ) : (
            <div>
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

      {/* Previous Visits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Previous Visits</span>
            <Badge variant={previousVisits.some(isOverdueVisit) ? 'destructive' : 'secondary'}>
              {previousVisits.filter(isOverdueVisit).length} Overdue
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {previousVisits.length === 0 ? (
            <div className="py-6 text-sm text-slate-500 text-center">No previous visits found.</div>
          ) : (
            <div className="space-y-3">
              {previousVisits.slice(0, 10).map((visit) => (
                <div key={visit.visitId} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{visit.purpose}</p>
                    <p className="text-xs text-slate-500">{visit.visitDate} {visit.startTime} - {visit.endTime}</p>
                  </div>
                  {isOverdueVisit(visit) ? (
                    <Badge variant="destructive">Overdue</Badge>
                  ) : (
                    <Badge variant={getBadgeVariant(visit.status)}>
                      {statusConfig[visit.status]?.label ?? visit.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Visits Awaiting Rating */}
      {completedAwaitingRating.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
              <FileText className="h-5 w-5" />
              Meeting Reports — Your Feedback Needed ({completedAwaitingRating.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {completedAwaitingRating.map(visit => {
                const cc = controlCards[visit.visitId];
                return (
                  <div key={visit.visitId} className="rounded-lg bg-white border border-emerald-100 overflow-hidden">
                    {/* Visit header */}
                    <div className="p-4 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-slate-900">{visit.purpose}</h4>
                        <Badge variant="secondary">Completed</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(visit.visitDate), 'EEE, MMM d, yyyy')}</span>
                        <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{visit.executiveName}</span>
                      </div>
                    </div>
                    {/* Meeting Notes from Control Card */}
                    {cc && (
                      <div className="p-4 space-y-3">
                        {cc.visitObjective && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Visit Objective</p>
                            <p className="text-sm text-slate-700">{cc.visitObjective}</p>
                          </div>
                        )}
                        {(cc.slaCompliance || cc.openTickets || cc.criticalIncidents) && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Service Review</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                              {cc.slaCompliance && <div className="rounded bg-slate-50 p-2"><span className="text-xs text-slate-400">SLA Compliance</span><p className="text-slate-700">{cc.slaCompliance}</p></div>}
                              {cc.openTickets && <div className="rounded bg-slate-50 p-2"><span className="text-xs text-slate-400">Open Tickets</span><p className="text-slate-700">{cc.openTickets}</p></div>}
                              {cc.criticalIncidents && <div className="rounded bg-slate-50 p-2"><span className="text-xs text-slate-400">Critical Incidents</span><p className="text-slate-700">{cc.criticalIncidents}</p></div>}
                            </div>
                          </div>
                        )}
                        {(cc.opportunitiesUpsell || cc.opportunitiesProcess) && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Opportunities & Improvements</p>
                            <div className="text-sm text-slate-700 space-y-1">
                              {cc.opportunitiesUpsell && <p>• <strong>Upsell:</strong> {cc.opportunitiesUpsell}</p>}
                              {cc.opportunitiesProcess && <p>• <strong>Process:</strong> {cc.opportunitiesProcess}</p>}
                            </div>
                          </div>
                        )}
                        {cc.actionItems && cc.actionItems.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Action Items</p>
                            <div className="space-y-1.5">
                              {cc.actionItems.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                  <div>
                                    <span className="text-slate-700">{item.action}</span>
                                    {item.owner && <span className="text-slate-400 ml-1">— {item.owner}</span>}
                                    {item.deadline && <span className="text-slate-400 ml-1">by {item.deadline}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Rate button */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100">
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => { setRatingVisit(visit); setRatingValue(0); setRatingHover(0); setRatingComment(''); }}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Rate This Visit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rating Modal */}
      {ratingVisit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-md">
            <CardHeader className="pb-3 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">Rate Your Visit Experience</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">Visit with {ratingVisit.executiveName} on {format(new Date(ratingVisit.visitDate), 'MMM d, yyyy')}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRatingVisit(null)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {/* Stars */}
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700 mb-3">How was your experience?</p>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      className="focus:outline-none transition-transform hover:scale-110"
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      onClick={() => setRatingValue(star)}
                    >
                      <Star
                        className={`h-8 w-8 ${(ratingHover || ratingValue) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      />
                    </button>
                  ))}
                </div>
                {ratingValue > 0 && (
                  <p className="text-sm text-slate-500 mt-2">
                    {ratingValue <= 2 ? 'We\'re sorry to hear that' : ratingValue <= 3 ? 'Average' : ratingValue === 4 ? 'Good experience!' : 'Excellent!'}
                  </p>
                )}
              </div>
              {/* Comment */}
              <div>
                <label className="text-sm font-medium text-slate-700">Additional comments (optional)</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  rows={3}
                  placeholder="Tell us more about your experience..."
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                />
              </div>
              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleSubmitRating}
                  disabled={ratingValue === 0 || submittingRating}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setRatingVisit(null)}>
                  Maybe Later
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-slate-500">Loading visits...</div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pending Approval</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Approved</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Rescheduled</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-500" /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Declined</span>
      </div>
    </div>
  );
}
