import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";
import {
  Mail, Phone, Crown, AlertTriangle, ShieldAlert,
  CheckCircle, Eye, TrendingDown, Zap, Loader2
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import { getAllTickets, type TicketRecord } from "../api/ticketApi";
import { getManagerVisits } from "../api/visitApi";
import { getCorporates, getManagerMonthlySpendingSummary, type CorporateRecord } from "../api/adminApi";
import ProfileEditSection from "../components/profile-edit-section";

type Tab = "profile" | "escalations" | "risk" | "resolution" | "settings";

const OPEN_STATUSES = new Set(["new", "assigned", "in_progress", "escalated"]);

function formatPendingTime(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function GMCRMProfile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [corporates, setCorporates] = useState<CorporateRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [visits, setVisits] = useState<Awaited<ReturnType<typeof getManagerVisits>>>([]);
  const [monthlySpending, setMonthlySpending] = useState("0.00");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoadingData(true);
      try {
        const [corpRes, ticketRes, visitRes, spendingRes] = await Promise.all([
          getCorporates().catch(() => [] as CorporateRecord[]),
          getAllTickets().catch(() => [] as TicketRecord[]),
          getManagerVisits().catch(() => []),
          getManagerMonthlySpendingSummary().catch(() => ({ total: "0.00", currency: "NAD" })),
        ]);
        setCorporates(corpRes);
        setTickets(ticketRes);
        setVisits(visitRes);
        setMonthlySpending(spendingRes.total || "0.00");
      } finally {
        setLoadingData(false);
      }
    };
    void run();
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";

  const openTickets = useMemo(() => tickets.filter((t) => OPEN_STATUSES.has(t.status)), [tickets]);
  const criticalTickets = useMemo(
    () => openTickets.filter((t) => t.priority === "critical" || t.status === "escalated"),
    [openTickets],
  );
  const highPriorityTickets = useMemo(
    () => openTickets.filter((t) => t.priority === "high" && t.status !== "escalated"),
    [openTickets],
  );

  const resolvedThisMonth = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    return tickets.filter(
      (t) => ["resolved", "closed"].includes(t.status) && t.createdAt?.slice(0, 7) === monthKey,
    ).length;
  }, [tickets]);

  const atRiskCorporates = useMemo(() => {
    const openByCorporate = new Map<number, number>();
    for (const t of openTickets) {
      if (t.corporateId == null) continue;
      openByCorporate.set(t.corporateId, (openByCorporate.get(t.corporateId) || 0) + 1);
    }
    return corporates.filter(
      (c) =>
        c.approvalStatus !== "approved" ||
        (openByCorporate.get(c.corporateId) || 0) >= 3 ||
        criticalTickets.some((t) => t.corporateId === c.corporateId),
    ).length;
  }, [corporates, openTickets, criticalTickets]);

  const riskRows = useMemo(() => {
    return corporates.map((corp) => {
      const corpTickets = openTickets.filter((t) => t.corporateId === corp.corporateId);
      const hasCritical = corpTickets.some((t) => t.priority === "critical" || t.status === "escalated");
      const issues = corpTickets.length;
      let health: "green" | "amber" | "red" = "green";
      if (hasCritical || issues >= 5) health = "red";
      else if (issues >= 2 || corp.approvalStatus !== "approved") health = "amber";

      const corpVisits = visits.filter((v) => v.corporateName === corp.corporateName);
      const rated = corpVisits.filter((v) => typeof v.customerRating === "number");
      const avgRating = rated.length
        ? Math.round((rated.reduce((s, v) => s + Number(v.customerRating), 0) / rated.length) * 10) / 10
        : null;

      return {
        corporateId: corp.corporateId,
        name: corp.corporateName,
        health,
        revenue: corp.monthlySpending ? `N$ ${Number(corp.monthlySpending).toLocaleString()}` : "—",
        issues,
        sla: issues === 0 ? "100%" : issues <= 2 ? "90%" : issues <= 4 ? "80%" : "70%",
        rating: avgRating,
        risk:
          hasCritical
            ? "Critical tickets open"
            : corp.approvalStatus !== "approved"
              ? `Pending approval (${corp.approvalStatus})`
              : issues > 0
                ? `${issues} open issue(s)`
                : "Stable",
      };
    }).filter((r) => r.issues > 0 || r.health !== "green")
      .sort((a, b) => b.issues - a.issues)
      .slice(0, 20);
  }, [corporates, openTickets, visits]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "GM CRM Profile" },
    { key: "escalations", label: "L3 Escalation Dashboard" },
    { key: "risk", label: "Corporate Risk Overview" },
    { key: "resolution", label: "Critical Issues (View)" },
    { key: "settings", label: "Profile Settings" },
  ];

  const kpiMetrics = [
    { label: "Total Corporates", value: String(corporates.length), color: "text-mtc-blue" },
    { label: "At-Risk Accounts", value: String(atRiskCorporates), color: "text-red-600" },
    { label: "L3 Escalations", value: String(criticalTickets.length), color: "text-amber-600" },
    {
      label: "Revenue (MTD)",
      value: `N$ ${Number(monthlySpending).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      color: "text-green-600",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">GM CRM Portal</h2>
          <p className="text-sm text-slate-500">Strategic oversight across managers — read-only monitoring</p>
        </div>
        <Badge className="text-sm px-3 py-1 bg-mtc-navy text-white border-transparent w-fit">GM CRM</Badge>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >{tab.label}</button>
        ))}
      </div>

      {loadingData && activeTab !== "settings" && (
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-mtc-blue" />
          <span className="text-sm">Loading live data…</span>
        </div>
      )}

      {activeTab === "profile" && !loadingData && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-full bg-mtc-navy flex items-center justify-center text-white text-3xl font-bold mb-4">{initials}</div>
              <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
              <p className="text-sm text-slate-500">{profile?.personId ? `EMP-${profile.personId}` : "—"} · General Manager CRM</p>
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
                <div className="flex items-center gap-2 text-slate-600"><Crown className="h-4 w-4 text-mtc-blue" /> Executive Management</div>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Strategic KPIs</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpiMetrics.map((m) => (
                  <div key={m.label} className="text-center p-4 rounded-lg bg-slate-50 border border-slate-100">
                    <span className={`text-2xl font-bold ${m.color}`}>{m.value}</span>
                    <p className="text-xs text-slate-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "escalations" && !loadingData && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-red-50 border-red-200">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-red-100"><Zap className="h-6 w-6 text-red-600" /></div>
                <div>
                  <span className="text-2xl font-bold text-red-600">{criticalTickets.length}</span>
                  <p className="text-xs text-red-700">Critical / Escalated</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-100"><AlertTriangle className="h-6 w-6 text-amber-600" /></div>
                <div>
                  <span className="text-2xl font-bold text-amber-600">{highPriorityTickets.length}</span>
                  <p className="text-xs text-slate-500">High Priority Open</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-100"><CheckCircle className="h-6 w-6 text-green-600" /></div>
                <div>
                  <span className="text-2xl font-bold text-green-600">{resolvedThisMonth}</span>
                  <p className="text-xs text-slate-500">Resolved This Month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-500" /> Escalation Queue</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Corporate</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Criticality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time Open</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...criticalTickets, ...highPriorityTickets].length === 0 ? (
                  <TableRow>
                    <td colSpan={7} className="p-4 text-center text-slate-500 py-8">No escalated tickets in your hierarchy.</td>
                  </TableRow>
                ) : (
                  [...criticalTickets, ...highPriorityTickets].map((t) => (
                    <TableRow key={t.ticketId}>
                      <TableCell className="font-medium text-mtc-blue">{t.ticketNumber}</TableCell>
                      <TableCell className="font-medium text-slate-900">{t.corporateName || t.accountName || "—"}</TableCell>
                      <TableCell className="max-w-xs"><p className="text-sm truncate">{t.title}</p></TableCell>
                      <TableCell>
                        <Badge variant={t.priority === "critical" || t.status === "escalated" ? "danger" : "warning"} className="w-fit">
                          {t.priority === "critical" || t.status === "escalated" ? "Critical" : "High"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{t.status.replace(/_/g, " ")}</TableCell>
                      <TableCell><span className="text-red-600 font-mono font-medium text-xs">{formatPendingTime(t.createdAt)}</span></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/tickets/${t.ticketId}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {activeTab === "risk" && !loadingData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /> Corporate Risk Overview</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corporate</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Revenue (MTD)</TableHead>
                <TableHead>Open Issues</TableHead>
                <TableHead>Est. SLA</TableHead>
                <TableHead>Visit Rating</TableHead>
                <TableHead>Risk Factor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riskRows.length === 0 ? (
                <TableRow>
                  <td colSpan={7} className="p-4 text-center text-slate-500 py-8">No at-risk corporates in your hierarchy.</td>
                </TableRow>
              ) : (
                riskRows.map((c) => (
                  <TableRow key={c.corporateId}>
                    <TableCell className="font-medium text-slate-900">{c.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-3 w-3 rounded-full ${c.health === "green" ? "bg-green-500" : c.health === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
                        <span className="text-xs capitalize font-medium">{c.health}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{c.revenue}</TableCell>
                    <TableCell><span className={c.issues > 5 ? "text-red-600 font-bold" : ""}>{c.issues}</span></TableCell>
                    <TableCell><span className={`font-medium ${parseInt(c.sla) < 80 ? "text-red-600" : parseInt(c.sla) < 90 ? "text-amber-600" : "text-green-600"}`}>{c.sla}</span></TableCell>
                    <TableCell>
                      {c.rating != null ? (
                        <span className={`font-bold ${c.rating >= 4 ? "text-green-600" : c.rating <= 2 ? "text-red-600" : "text-amber-600"}`}>{c.rating}/5</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell><span className="text-xs text-slate-600">{c.risk}</span></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === "resolution" && !loadingData && (
        <div className="space-y-6">
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="pt-6 flex items-center gap-3">
              <Zap className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-slate-700">
                Critical issues under your managers. GM monitoring is <strong>read-only</strong> — view ticket details for current status and resolution progress.
              </p>
            </CardContent>
          </Card>

          {criticalTickets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-500 text-sm">No critical issues requiring attention.</CardContent>
            </Card>
          ) : (
            criticalTickets.map((item) => (
              <Card key={item.ticketId} className="border-red-200">
                <CardHeader className="bg-red-50 border-b border-red-200 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-red-600" /> {item.ticketNumber} — {item.corporateName || item.accountName}
                    </CardTitle>
                    <Badge variant="danger" className="w-fit capitalize">{item.status.replace(/_/g, " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span className="text-slate-500 block">Issue</span><p className="font-medium text-slate-900">{item.title}</p></div>
                    <div><span className="text-slate-500 block">Priority</span><p className="font-medium capitalize">{item.priority}</p></div>
                    <div><span className="text-slate-500 block">Category</span><p className="font-medium capitalize">{item.category}</p></div>
                    <div><span className="text-slate-500 block">Opened</span><p className="font-medium">{new Date(item.createdAt).toLocaleString()}</p></div>
                  </div>
                  <div className="flex justify-end border-t border-slate-200 pt-4">
                    <Button variant="outline" onClick={() => navigate(`/tickets/${item.ticketId}`)}>
                      <Eye className="h-4 w-4 mr-1" /> View Ticket
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "settings" && profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={(updated) => setProfile(updated)} />
      )}
    </div>
  );
}
