import { useState, useEffect } from 'react';
import { Link } from 'react-router';
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
  MapPin, 
  Star,
  TrendingUp,
  Send,
  CheckCircle,
  Calendar,
  User,
  Smartphone,
  FileText,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { getMyAccount } from '../../api/authApi';
import type { CustomerAccountResponse } from '../../api/authApi';
import { getCustomerVisits, type VisitRecord } from '../../api/visitApi';
import { getMyTickets, type TicketRecord } from '../../api/ticketApi';

export function CustomerAccount() {
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

  const { account, accounts, corporate, accountManager, executive, services, contracts } = data;
  const activeServices = services.filter(s => s.status === 'active');
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
  const contactName = accountManager
    ? `${accountManager.firstName} ${accountManager.lastName}`
    : `${account.contactFirstName} ${account.contactLastName}`;
  const executiveName = executive ? `${executive.firstName} ${executive.lastName}` : null;
  const executiveInitials = executive ? `${executive.firstName[0]}${executive.lastName[0]}` : '';
  const linkedAccountsCount = accounts?.length ?? 1;


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
            <p className="font-medium">{accountManager?.email || account.contactEmail}</p>
            <p className="text-slate-500 pt-1">Phone</p>
            <p className="font-medium">{accountManager?.phone || account.contactPhone || '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Corporate Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-slate-500">Company Name</p>
            <p className="font-medium">{corporate?.corporateName || account.accountName}</p>
            <p className="text-slate-500 pt-1">Main Number</p>
            <p className="font-medium">{corporate?.corporateNumber || '—'}</p>
            <p className="text-slate-500 pt-1">Status</p>
            <Badge className={getStatusBadge(account.approvalStatus)}>
              {account.approvalStatus.toUpperCase()}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Active Lines</CardTitle>
            <Smartphone className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{services.length}</div>
            <p className="text-xs text-gray-500 mt-1">{linkedAccountsCount} sub-accounts under corporate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Spending</CardTitle>
            <FileText className="size-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-mtc-blue">N$ --</div>
            <p className="text-xs text-gray-500 mt-1">From {contracts.length} contract(s)</p>
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
          <CardTitle>Sub-Accounts / Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="border-b">
                <th className="text-left py-2">Account Number</th>
                <th className="text-left py-2">Location/Branch</th>
                <th className="text-left py-2">Service Type</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Monthly Spending</th>
              </tr>
            </thead>
            <tbody>
              {(accounts || [account]).map((acc) => {
                const accServices = servicesByAccount.get(acc.accountId) || [];
                const primaryServiceType = accServices[0]?.serviceType || '—';
                const status = acc.isActive ? 'active' : 'inactive';
                return (
                  <tr key={acc.accountId} className="border-b last:border-0">
                    <td className="py-3">{acc.accountNumber}</td>
                    <td className="py-3">—</td>
                    <td className="py-3 capitalize">{primaryServiceType}</td>
                    <td className="py-3"><Badge className={getStatusBadge(status)}>{status}</Badge></td>
                    <td className="py-3 text-right">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                    <p>{accountManager?.email || account.contactEmail}</p>
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
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">MTC Lines Under Your Account</h2>
                <p className="text-sm text-gray-500">Manage and view all mobile lines under {corporate?.corporateName || account.accountName}</p>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <PhoneCall className="size-4 mr-2" />
              Request New Line
            </Button>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 py-8">No services have been added to this account yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {services.map((service) => (
                <Card key={service.serviceId} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    {/* Top section: MSISDN, badge, plan, and price */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <Phone className="size-5 text-gray-600" />
                          <span className="text-lg font-medium">{service.msisdn || `Service #${service.serviceId}`}</span>
                          <Badge className={getStatusBadge(service.status)}>
                            {service.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 ml-8 capitalize">
                          {service.serviceType}
                          {service.accountName ? ` - ${service.accountName}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-semibold">N$899</span>
                        <p className="text-sm text-gray-500">per month</p>
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t">
                      <div>
                        <p className="text-sm text-gray-500">Assigned To</p>
                        <p className="text-sm font-medium">—</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Department</p>
                        <p className="text-sm font-medium">—</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Data Usage</p>
                        <p className="text-sm font-medium">—</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Voice Usage</p>
                        <p className="text-sm font-medium">—</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 mt-5">
                      <Button variant="outline" size="sm">View Details</Button>
                      <Button variant="outline" size="sm">Change Plan</Button>
                      <Button variant="outline" size="sm">Manage</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contracts" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl">Contracts</h2>
            <p className="text-sm text-gray-600">Contract details for {corporate?.corporateName || account.accountName}</p>
          </div>

          {contracts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 py-8">No contracts have been created for this account yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {contracts.map((contract) => (
                <Card key={contract.contractId} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium capitalize">{contract.contractType}</h3>
                        {contract.srNumber && (
                          <p className="text-sm text-gray-500">
                            SR: {contract.srNumber}
                            {contract.accountName ? ` - ${contract.accountName}` : ''}
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
              ))}
            </div>
          )}
        </TabsContent>


      </Tabs>
    </div>
  );
}
