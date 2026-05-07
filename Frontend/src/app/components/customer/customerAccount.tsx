import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { 
  Building2, 
  Phone, 
  PhoneCall,
  Mail, 
  Star,
  TrendingUp,
  CheckCircle,
  Calendar,
  User,
  Smartphone,
  FileText,
  Loader2,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { format } from 'date-fns';
import { getMyAccount } from '../../api/authApi';
import type { CustomerAccountResponse } from '../../api/authApi';
import { getCustomerVisits, type VisitRecord } from '../../api/visitApi';
import { getMyTickets, type TicketRecord } from '../../api/ticketApi';

export function CustomerAccount() {
  const navigate = useNavigate();
  const [data, setData] = useState<CustomerAccountResponse | null>(null);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    Promise.all([getMyAccount(), getCustomerVisits(), getMyTickets()])
      .then(([accountData, visitData, ticketData]) => {
        setData(accountData);
        setVisits(visitData);
        setTickets(ticketData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">{error || 'Account not found. Please log in again.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { account, accounts, corporate, corporates, accountManager, executive, services, contracts } = data;
  const subAccounts = accounts ?? [account];
  const linkedCorporates = corporates && corporates.length > 0
    ? corporates
    : corporate
      ? [corporate]
      : [];
  const distinctCorporateIds = new Set(
    subAccounts
      .map((a) => a.corporateId)
      .filter((id): id is number => typeof id === "number")
  );
  const isMultiCorporate = linkedCorporates.length > 1 || distinctCorporateIds.size > 1;
  const activeServices = services.filter((s) => s.status === 'active');
  const openTickets = tickets.filter((t) => !['resolved', 'closed', 'rejected'].includes(t.status));
  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);
  const upcomingVisits = visits
    .filter((v) => ['pending', 'approved', 'confirmed', 'rescheduled'].includes(v.status))
    .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime());
  const servicesByAccount = new Map<number, typeof services>();
  for (const service of services) {
    const bucket = servicesByAccount.get(service.accountId) || [];
    bucket.push(service);
    servicesByAccount.set(service.accountId, bucket);
  }
  const contractsByAccount = new Map<number, typeof contracts>();
  for (const c of contracts) {
    if (c.accountId == null) continue;
    const bucket = contractsByAccount.get(c.accountId) || [];
    bucket.push(c);
    contractsByAccount.set(c.accountId, bucket);
  }
  const accountContactFullName = `${account.contactFirstName || ""} ${account.contactLastName || ""}`.trim();
  const accountContactEmailLooksDummy = (account.contactEmail || "").toLowerCase().endsWith("@placeholder.local");
  const accountContactLooksImported =
    (account.contactFirstName || "").trim() === "Imported" && (account.contactLastName || "").trim() === "Contact";
  const contactName = accountManager
    ? `${accountManager.firstName} ${accountManager.lastName}`
    : !accountContactFullName || accountContactLooksImported
      ? "Not assigned"
      : accountContactFullName;
  const contactEmailDisplay = accountManager?.email
    || (accountContactEmailLooksDummy || !account.contactEmail ? "Not assigned" : account.contactEmail);
  const executiveName = executive ? `${executive.firstName} ${executive.lastName}` : null;
  const executiveInitials = executive ? `${executive.firstName[0]}${executive.lastName[0]}` : '';
  const subAccountCount = subAccounts.length;
  const formatNad = (value: string | number | null | undefined) =>
    `N$ ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      approved: 'bg-green-100 text-green-700',
      suspended: 'bg-red-100 text-red-700',
      rejected: 'bg-red-100 text-red-700',
      inactive: 'bg-gray-100 text-gray-700',
      pending: 'bg-yellow-100 text-yellow-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-1">Customer Portal</h1>
        <p className="text-gray-600">
          Welcome back, {contactName}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Person</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-slate-500">Name</p>
            <p className="font-medium">{contactName}</p>
            <p className="text-slate-500 pt-1">Email</p>
            <p className="font-medium">{contactEmailDisplay}</p>
            <p className="text-slate-500 pt-1">Phone</p>
            <p className="font-medium">{accountManager?.phone || account.contactPhone || '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isMultiCorporate ? 'Corporate Accounts' : 'Corporate Account'}
            </CardTitle>
            <CardDescription>
              {subAccountCount} sub-account{subAccountCount === 1 ? '' : 's'} across{' '}
              {linkedCorporates.length} corporate{linkedCorporates.length === 1 ? '' : 's'}. Each
              sub-account can hold multiple services and lines, with its own contract(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {isMultiCorporate ? (
              <ul className="space-y-2">
                {linkedCorporates.map((corp) => (
                  <li
                    key={corp.corporateId}
                    className="rounded-md border border-slate-200 px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{corp.corporateName}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {corp.corporateNumber || '—'}
                      </div>
                    </div>
                    {corp.industry ? (
                      <Badge className="bg-slate-100 text-slate-700 shrink-0">{corp.industry}</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="text-slate-500">Company Name</p>
                <p className="font-medium">{corporate?.corporateName || account.accountName}</p>
                <p className="text-slate-500 pt-1">Main Number</p>
                <p className="font-medium">{corporate?.corporateNumber || '—'}</p>
                <p className="text-slate-500 pt-1">Status</p>
                <Badge className={getStatusBadge(account.approvalStatus)}>
                  {account.approvalStatus.toUpperCase()}
                </Badge>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Services &amp; lines</CardTitle>
            <Smartphone className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              {activeServices.length}
              <span className="text-base font-normal text-slate-500"> / {services.length}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Active / total across {subAccountCount} sub-account{subAccountCount === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Sub-accounts</CardTitle>
            <Layers className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{subAccountCount}</div>
            <p className="text-xs text-gray-500 mt-1">
              {contracts.length} contract{contracts.length === 1 ? '' : 's'} total (per sub-account below)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Spending</CardTitle>
            <FileText className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-mtc-blue">{formatNad(data.spendingSummary?.corporateMonthlySpending || 0)}</div>
            <p className="text-xs text-gray-500 mt-1">Paid invoices this month (corporate total)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Open Tickets</CardTitle>
            <CheckCircle className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{openTickets.length}</div>
            <p className="text-xs text-gray-500 mt-1">{openTickets.filter((t) => t.priority === 'high').length} high priority</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Upcoming Visits</CardTitle>
            <User className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{upcomingVisits.length}</div>
            <p className="text-xs text-gray-500 mt-1">
              Next: {upcomingVisits[0] ? upcomingVisits[0].visitDate : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Sub-accounts</CardTitle>
          <CardDescription>
            Each row is a billing / contract entity under your corporate. Lines and services are listed under that sub-account in the tabs below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-slate-500">
                <tr className="border-b">
                  <th className="text-left py-2">Sub-account</th>
                  {isMultiCorporate && <th className="text-left py-2">Corporate</th>}
                  <th className="text-left py-2">Account no.</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Lines</th>
                  <th className="text-left py-2">Contracts</th>
                  <th className="text-left py-2">Monthly Spending</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {subAccounts.map((acc) => {
                  const accServices = servicesByAccount.get(acc.accountId) || [];
                  const accContracts = contractsByAccount.get(acc.accountId) || [];
                  const activeCount = accServices.filter((s) => s.status === 'active').length;
                  const lineLabel =
                    accServices.length === 0
                      ? '—'
                      : `${accServices.length} line${accServices.length === 1 ? '' : 's'} (${activeCount} active)`;
                  const contractSummary =
                    accContracts.length === 0
                      ? '—'
                      : `${accContracts.length} · ${accContracts.map((c) => c.contractType).slice(0, 2).join(', ')}${
                          accContracts.length > 2 ? '…' : ''
                        }`;
                  const status = acc.isActive ? 'active' : 'inactive';
                  return (
                    <tr key={acc.accountId} className="border-b last:border-0">
                      <td className="py-3 font-medium text-slate-900">{acc.accountName}</td>
                      {isMultiCorporate && (
                        <td className="py-3 text-slate-700">{acc.corporateName || '—'}</td>
                      )}
                      <td className="py-3 tabular-nums">{acc.accountNumber}</td>
                      <td className="py-3 capitalize">{acc.accountType}</td>
                      <td className="py-3">{lineLabel}</td>
                      <td className="py-3 capitalize">{contractSummary}</td>
                      <td className="py-3">{formatNad(acc.monthlySpending)}</td>
                      <td className="py-3">
                        <Badge className={getStatusBadge(status)}>{status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Scheduled Visits</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left py-2">Visit ID</th>
                <th className="text-left py-2">Date & Time</th>
                <th className="text-left py-2">Purpose</th>
                <th className="text-left py-2">Location</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingVisits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">No scheduled visits</td>
                </tr>
              ) : (
                upcomingVisits.slice(0, 5).map((visit) => (
                  <tr key={visit.visitId} className="border-b last:border-0">
                    <td className="py-3">{visit.visitNumber}</td>
                    <td className="py-3">{visit.visitDate} at {visit.startTime}</td>
                    <td className="py-3">{visit.purpose}</td>
                    <td className="py-3">{visit.location || (visit.meetingType === 'online' ? 'Online' : '—')}</td>
                    <td className="py-3"><Badge className={getStatusBadge(visit.status)}>{visit.status}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>My Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left py-2">Ticket ID</th>
                <th className="text-left py-2">Subject</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Criticality</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">No tickets yet</td>
                </tr>
              ) : (
                recentTickets.map((ticket) => (
                  <tr key={ticket.ticketId} className="border-b last:border-0">
                    <td className="py-3 font-medium">{ticket.ticketNumber}</td>
                    <td className="py-3">{ticket.title}</td>
                    <td className="py-3">
                      <Badge className={getStatusBadge(ticket.status)}>
                        {ticket.status === 'in_progress'
                          ? 'In Progress'
                          : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Badge className={getStatusBadge(ticket.priority)}>
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="pt-4 text-center">
            <Link to="/customerTickets" className="text-mtc-blue font-medium hover:underline">
              View All Tickets
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Account Details</TabsTrigger>
          <TabsTrigger value="services">Services & Lines</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company Information */}
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Corporate Name</p>
                    <p>{corporate?.corporateName || account.accountName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <TrendingUp className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Industry</p>
                    <p>{account.industry || '—'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileText className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Corporate Number</p>
                    <p>{corporate?.corporateNumber || '—'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Corporate Type</p>
                    <p className="capitalize">{corporate?.corporateType || account.accountType}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Primary Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Contact Person</p>
                    <p>{contactName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p>{contactEmailDisplay}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="size-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p>{accountManager?.phone || account.contactPhone || '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Executive */}
            {executive && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Account Executive</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="size-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xl">
                      {executiveInitials}
                    </div>
                    <div>
                      <p className="font-medium">{executiveName}</p>
                      {executive.region && <p className="text-sm text-gray-500">{executive.region}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="size-4 text-gray-400" />
                      <span>{executive.email}</span>
                    </div>
                    {executive.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="size-4 text-gray-400" />
                        <span>{executive.phone}</span>
                      </div>
                    )}
                  </div>

                  <Button className="w-full mt-4" onClick={() => window.location.href = `mailto:${executive.email}`}>
                    <Mail className="size-4 mr-2" />
                    Contact Executive
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold">Services &amp; lines by sub-account</h2>
              <p className="text-sm text-gray-500">
                Each sub-account can include multiple MTC lines and service types under {corporate?.corporateName || account.accountName}.
                Monthly billing is shown at sub-account level, not per line.
              </p>
            </div>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              onClick={() => navigate('/customerTickets?newRequest=new_line')}
            >
              <PhoneCall className="size-4 mr-2" />
              Request New Line
            </Button>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 py-8">No services have been added under your sub-accounts yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {subAccounts.map((acc, idx) => {
                const accServices = servicesByAccount.get(acc.accountId) || [];
                return (
                  <Collapsible key={acc.accountId} defaultOpen={idx === 0}>
                    <Card className="overflow-hidden border-slate-200">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50/80 transition-colors [&[data-state=open]_svg]:rotate-180">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 truncate">{acc.accountName}</p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {acc.accountNumber} · {accServices.length} line{accServices.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="text-right shrink-0 pr-1">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">Monthly (sub-account)</p>
                          <p className="text-base font-semibold text-slate-900 tabular-nums">{formatNad(acc.monthlySpending)}</p>
                        </div>
                        <ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform duration-200" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 px-4 space-y-3 border-t bg-slate-50/50">
                          {accServices.length === 0 ? (
                            <p className="text-sm text-slate-600 py-4">No lines registered under this sub-account yet.</p>
                          ) : (
                            accServices.map((service) => (
                              <Card key={service.serviceId} className="shadow-sm border-slate-200 bg-white">
                                <CardContent className="p-4">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                      <Phone className="size-4 text-gray-600 shrink-0" />
                                      <span className="text-base font-medium truncate">
                                        {service.msisdn || `Service #${service.serviceId}`}
                                      </span>
                                      <Badge className={getStatusBadge(service.status)}>{service.status}</Badge>
                                    </div>
                                    <p className="text-sm text-gray-500 capitalize">{service.serviceType}</p>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t text-sm">
                                    <div>
                                      <p className="text-gray-500">Assigned To</p>
                                      <p className="font-medium">—</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Department</p>
                                      <p className="font-medium">—</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Data Usage</p>
                                      <p className="font-medium">—</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Voice Usage</p>
                                      <p className="font-medium">—</p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-4">
                                    <Button variant="outline" size="sm">
                                      View Details
                                    </Button>
                                    <Button variant="outline" size="sm">
                                      Change Plan
                                    </Button>
                                    <Button variant="outline" size="sm">
                                      Manage
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contracts" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl">Contracts by sub-account</h2>
            <p className="text-sm text-gray-600">
              Contracts are stored per sub-account (and may also apply to individual lines where applicable).
            </p>
          </div>

          {contracts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 py-8">No contracts have been linked to your sub-accounts yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {subAccounts.map((acc, idx) => {
                const accContracts = contractsByAccount.get(acc.accountId) || [];
                return (
                  <Collapsible key={`c-${acc.accountId}`} defaultOpen={idx === 0}>
                    <Card className="overflow-hidden border-slate-200">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50/80 transition-colors [&[data-state=open]_svg]:rotate-180">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{acc.accountName}</p>
                          <p className="text-xs text-slate-500">
                            {accContracts.length} contract{accContracts.length === 1 ? '' : 's'} · {acc.accountNumber}
                          </p>
                        </div>
                        <ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform duration-200" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 px-4 space-y-3 border-t bg-slate-50/50">
                          {accContracts.length === 0 ? (
                            <p className="text-sm text-slate-600 py-4">No contracts on file for this sub-account.</p>
                          ) : (
                            accContracts.map((contract) => (
                              <Card key={contract.contractId} className="shadow-sm border-slate-200 bg-white">
                                <CardContent className="p-6">
                                  <div className="flex items-start justify-between mb-4 gap-3">
                                    <div>
                                      <h3 className="text-lg font-medium capitalize">{contract.contractType}</h3>
                                      {contract.srNumber && (
                                        <p className="text-sm text-gray-500">SR: {contract.srNumber}</p>
                                      )}
                                      {contract.serviceId != null && (
                                        <p className="text-xs text-slate-500 mt-1">
                                          Linked to service / line ID {contract.serviceId}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t">
                                    {contract.contractStartDate && (
                                      <div>
                                        <p className="text-sm text-gray-500">Start Date</p>
                                        <p className="text-sm">{format(new Date(contract.contractStartDate), 'MMM dd, yyyy')}</p>
                                      </div>
                                    )}
                                    {contract.contractEndDate && (
                                      <div>
                                        <p className="text-sm text-gray-500">End Date</p>
                                        <p className="text-sm">{format(new Date(contract.contractEndDate), 'MMM dd, yyyy')}</p>
                                      </div>
                                    )}
                                    {contract.contractEffectiveDate && (
                                      <div>
                                        <p className="text-sm text-gray-500">Effective Date</p>
                                        <p className="text-sm">{format(new Date(contract.contractEffectiveDate), 'MMM dd, yyyy')}</p>
                                      </div>
                                    )}
                                    {contract.usageLimit && (
                                      <div>
                                        <p className="text-sm text-gray-500">Usage Limit</p>
                                        <p className="text-sm">{contract.usageLimit}</p>
                                      </div>
                                    )}
                                    {contract.entitlement && (
                                      <div className="col-span-2">
                                        <p className="text-sm text-gray-500">Entitlement</p>
                                        <p className="text-sm">{contract.entitlement}</p>
                                      </div>
                                    )}
                                  </div>

                                  {contract.notes && (
                                    <div className="mt-4 pt-4 border-t">
                                      <p className="text-sm text-gray-500">Notes</p>
                                      <p className="text-sm text-gray-700">{contract.notes}</p>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </TabsContent>


      </Tabs>
    </div>
  );
}
