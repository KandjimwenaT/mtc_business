import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Label, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../components/ui-components";
import {
  User, Phone, Mail, Building2, MapPin, Star, Calendar, CheckCircle,
  Clock, FileText, Eye, MessageSquare, TrendingUp, TrendingDown, Settings
} from "lucide-react";
import { getMyProfile } from "../api/authApi";
import type { UserProfile } from "../api/authApi";
import { getCustomerVisits, type VisitRecord } from "../api/visitApi";
import ProfileEditSection from "../components/profile-edit-section";

type Tab = "profile" | "requests" | "ratings" | "settings";

export default function AccountManagerProfile() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [status, setStatus] = useState("Available");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [visitRatings, setVisitRatings] = useState<VisitRecord[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  useEffect(() => {
    if (activeTab !== "ratings") return;
    let cancelled = false;
    setRatingsLoading(true);
    getCustomerVisits()
      .then((data) => {
        if (!cancelled) setVisitRatings(data);
      })
      .catch(() => {
        if (!cancelled) {
          setVisitRatings([]);
          toast.error("Failed to load rating history");
        }
      })
      .finally(() => {
        if (!cancelled) setRatingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const ratedVisits = useMemo(() => {
    return visitRatings
      .filter((v) => v.customerRating != null && v.customerRating > 0)
      .sort((a, b) => {
        const ta = a.customerRatedAt ? new Date(a.customerRatedAt).getTime() : 0;
        const tb = b.customerRatedAt ? new Date(b.customerRatedAt).getTime() : 0;
        return tb - ta;
      });
  }, [visitRatings]);

  const ratingStats = useMemo(() => {
    const n = ratedVisits.length;
    if (n === 0) {
      return {
        average: null as number | null,
        fiveStarPct: null as number | null,
        lowCount: 0,
      };
    }
    const sum = ratedVisits.reduce((s, v) => s + (v.customerRating ?? 0), 0);
    const fiveStars = ratedVisits.filter((v) => v.customerRating === 5).length;
    const lowCount = ratedVisits.filter((v) => (v.customerRating ?? 0) <= 2).length;
    return {
      average: sum / n,
      fiveStarPct: Math.round((fiveStars / n) * 100),
      lowCount,
    };
  }, [ratedVisits]);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "..";

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "My Profile" },
    { key: "requests", label: "Requests & Complaints" },
    { key: "ratings", label: "Rating History" },
    { key: "settings", label: "Profile Settings" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Account Manager Portal</h2>
          <p className="text-sm text-slate-500">Manage your profile, accounts, and customer interactions</p>
        </div>
        <Badge variant="default" className="text-sm px-3 py-1">Account Manager</Badge>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "border-mtc-blue text-mtc-blue"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* MY PROFILE */}
      {activeTab === "profile" && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-full bg-mtc-blue flex items-center justify-center text-white text-3xl font-bold mb-4">
                {initials}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
              <p className="text-sm text-slate-500">{profile?.id ? `EMP-${String(profile.id).padStart(6, '0')}` : "..."}</p>
              <div className="mt-4 w-full space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value); toast.success(`Status updated to ${e.target.value}`); }}>
                    <option>Available</option>
                    <option>Busy</option>
                    <option>Away</option>
                    <option>In a Meeting</option>
                    <option>On Leave</option>
                  </Select>
                </div>
                <div className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium ${
                  status === "Available" ? "bg-green-100 text-green-800" :
                  status === "Busy" ? "bg-red-100 text-red-800" :
                  status === "Away" ? "bg-yellow-100 text-yellow-800" :
                  "bg-blue-100 text-blue-800"
                }`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    status === "Available" ? "bg-green-500" :
                    status === "Busy" ? "bg-red-500" :
                    status === "Away" ? "bg-yellow-500" :
                    "bg-blue-500"
                  }`} />
                  {status}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Contact & Corporate Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={profile?.email || "—"} />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={profile?.phone || "—"} />
                <InfoRow icon={<Building2 className="h-4 w-4" />} label="Department" value={profile?.department || "—"} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Region" value={profile?.region || "—"} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Role" value={profile?.role || "—"} />
                <InfoRow icon={<Calendar className="h-4 w-4" />} label="Joined" value="—" />
              </div>
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Performance Summary</h4>
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard label="Avg Rating" value="4.3" color="text-mtc-blue" />
                  <MetricCard label="Accounts" value="12" color="text-slate-900" />
                  <MetricCard label="Open Tickets" value="8" color="text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* REQUESTS & COMPLAINTS */}
      {activeTab === "requests" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">My Requests & Complaints (Read-Only SLA View)</CardTitle>
            <div className="flex gap-2">
              <Badge variant="warning">3 Warning</Badge>
              <Badge variant="danger">1 Breached</Badge>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA Status</TableHead>
                <TableHead>Time Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { id: "REQ-00124", corp: "Namibia Breweries", type: "Request", cat: "Renewal", status: "In Progress", sla: "warning", time: "2h 15m" },
                { id: "CMP-00431", corp: "First National Bank", type: "Complaint", cat: "Billing", status: "Escalated L1", sla: "breached", time: "-1h 30m" },
                { id: "REQ-00125", corp: "Ministry of Finance", type: "Request", cat: "Upgrade", status: "New", sla: "success", time: "23h 45m" },
                { id: "CMP-00432", corp: "Ohlthaver & List", type: "Complaint", cat: "Network QoS", status: "Assigned", sla: "danger", time: "45m" },
                { id: "REQ-00126", corp: "Telecom Namibia", type: "Request", cat: "New Connection", status: "New", sla: "success", time: "47h" },
                { id: "CMP-00433", corp: "Bank Windhoek", type: "Complaint", cat: "Billing", status: "In Progress", sla: "warning", time: "5h 30m" },
              ].map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-mtc-blue">{t.id}</TableCell>
                  <TableCell className="font-medium text-slate-900">{t.corp}</TableCell>
                  <TableCell><Badge variant={t.type === "Complaint" ? "danger" : "default"}>{t.type}</Badge></TableCell>
                  <TableCell>{t.cat}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell><Badge variant={t.sla as any}>{t.sla === "success" ? "On Track" : t.sla === "warning" ? "Warning" : t.sla === "breached" ? "Breached" : "At Risk"}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{t.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* RATING HISTORY */}
      {activeTab === "ratings" && (
        <div className="space-y-6">
          {ratingsLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-500">Loading rating history…</CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-mtc-blue-50 border-mtc-blue-100">
                  <CardContent className="pt-6 text-center">
                    <span className="text-3xl font-bold text-mtc-blue tabular-nums">
                      {ratingStats.average != null ? ratingStats.average.toFixed(1) : "—"}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">Overall avg rating</p>
                    {ratingStats.average != null && (
                      <div className="flex justify-center gap-0.5 mt-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-4 w-4 ${s <= Math.round(ratingStats.average!) ? "fill-blue-400 text-blue-400" : "text-slate-200"}`}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <span className="text-3xl font-bold text-green-600 tabular-nums">
                      {ratingStats.fiveStarPct != null ? `${ratingStats.fiveStarPct}%` : "—"}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">5-star ratings</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <span className="text-3xl font-bold text-slate-900 tabular-nums">{ratedVisits.length}</span>
                    <p className="text-xs text-slate-500 mt-1">Total reviews</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <span className="text-3xl font-bold text-red-600 tabular-nums">{ratingStats.lowCount}</span>
                    <p className="text-xs text-slate-500 mt-1">Low ratings (1–2 stars)</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your visit ratings</CardTitle>
                  <p className="text-sm text-slate-500 font-normal">
                    Ratings you submitted after completed executive visits.
                  </p>
                </CardHeader>
                {ratedVisits.length === 0 ? (
                  <CardContent className="pb-8 text-center text-sm text-slate-500">
                    You have not submitted any visit ratings yet. After a visit is completed and your executive shares a report, you can rate it from{" "}
                    <span className="font-medium text-slate-700">Visit Calendar</span>.
                  </CardContent>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rated on</TableHead>
                        <TableHead>Visit date</TableHead>
                        <TableHead>Corporate</TableHead>
                        <TableHead>Visit purpose</TableHead>
                        <TableHead>Executive</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Your comment</TableHead>
                        <TableHead>Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ratedVisits.map((v, i) => {
                        const older = ratedVisits[i + 1];
                        const trend =
                          older == null
                            ? null
                            : (v.customerRating ?? 0) > (older.customerRating ?? 0)
                              ? "up"
                              : (v.customerRating ?? 0) < (older.customerRating ?? 0)
                                ? "down"
                                : "same";
                        const ratedOn = v.customerRatedAt
                          ? format(new Date(v.customerRatedAt), "MMM d, yyyy")
                          : "—";
                        const visitDay = format(new Date(v.visitDate), "MMM d, yyyy");
                        const corp = v.corporateName || v.accountName || "—";
                        const comment = (v.customerRatingComment || "").trim();
                        const r = v.customerRating ?? 0;
                        return (
                          <TableRow key={v.visitId}>
                            <TableCell className="whitespace-nowrap">{ratedOn}</TableCell>
                            <TableCell className="whitespace-nowrap text-slate-600">{visitDay}</TableCell>
                            <TableCell className="font-medium text-slate-900">{corp}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={v.purpose}>{v.purpose}</TableCell>
                            <TableCell className="text-slate-600">{v.executiveName}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <span
                                  className={`font-bold tabular-nums ${
                                    r >= 4 ? "text-green-600" : r <= 2 ? "text-red-600" : "text-amber-600"
                                  }`}
                                >
                                  {r}/5
                                </span>
                                <Star
                                  className={`h-4 w-4 shrink-0 ${
                                    r >= 4
                                      ? "fill-green-400 text-green-400"
                                      : r <= 2
                                        ? "fill-red-400 text-red-400"
                                        : "fill-amber-400 text-amber-400"
                                  }`}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              {comment ? (
                                <span className="text-sm text-slate-700 line-clamp-2" title={comment}>
                                  {comment}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {trend === "up" ? (
                                <TrendingUp className="h-4 w-4 text-green-500" aria-label="Up vs previous" />
                              ) : trend === "down" ? (
                                <TrendingDown className="h-4 w-4 text-red-500" aria-label="Down vs previous" />
                              ) : trend === "same" ? (
                                <span className="text-slate-400 text-xs">Same</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </div>
      )}



      {/* PROFILE SETTINGS */}
      {activeTab === "settings" && profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={(updated) => setProfile(updated)} readOnlyProfile />
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50 border border-slate-100">
      <div className="text-mtc-blue">{icon}</div>
      <div>
        <span className="text-xs text-slate-500 block">{label}</span>
        <span className="text-sm font-medium text-slate-900">{value}</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center p-3 rounded-md bg-slate-50 border border-slate-100">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function VisitConfirmationCard({ visit }: { visit: { id: number; corp: string; date: string; location: string; agenda: string; confirmed: boolean } }) {
  const [confirmed, setConfirmed] = useState(visit.confirmed);

  return (
    <Card className={confirmed ? "border-green-200 bg-green-50/30" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h4 className="font-semibold text-slate-900">{visit.corp}</h4>
              {confirmed && <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" /> Confirmed</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="h-3.5 w-3.5" /> {visit.date}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-3.5 w-3.5" /> {visit.location}
              </div>
              <div className="flex items-center gap-2 text-slate-600 col-span-2">
                <FileText className="h-3.5 w-3.5" /> {visit.agenda}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!confirmed ? (
              <Button
                size="sm"
                onClick={() => {
                  setConfirmed(true);
                  toast.success("Visit confirmed", { description: `You confirmed attendance for ${visit.corp}.` });
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Confirm
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>Confirmed</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
