import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { AlertCircle, CheckCircle2, Clock, FileText, Send, Loader2 } from 'lucide-react';
import { submitComplaint, getMyComplaints, type ComplaintRecord } from '../../api/complaintApi';
import { format } from 'date-fns';

export function CustomerComplaints() {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accountComplaints, setAccountComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const data = await getMyComplaints();
      setAccountComplaints(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!type || !priority || !title || !description) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setSubmitting(true);
      await submitComplaint({ type, priority, title, description });
      setSubmitted(true);
      // Refresh list after submission
      await fetchComplaints();
      setTimeout(() => {
        setShowForm(false);
        setSubmitted(false);
        setType('');
        setPriority('');
        setTitle('');
        setDescription('');
      }, 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to submit complaint');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, {variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any}> = {
      pending: { variant: 'outline', icon: Clock },
      open: { variant: 'destructive', icon: AlertCircle },
      in_progress: { variant: 'default', icon: Clock },
      resolved: { variant: 'secondary', icon: CheckCircle2 },
      closed: { variant: 'outline', icon: CheckCircle2 },
    };
    const { variant, icon: Icon } = config[status] || config.pending;
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="size-3" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-[#ED1C24] text-white',
      medium: 'bg-yellow-500 text-white',
      low: 'bg-gray-500 text-white',
    };
    return <Badge className={colors[priority]}>{priority.toUpperCase()}</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl mb-2">Issues & Complaints</h1>
          <p className="text-gray-600">Log and track your service issues and complaints</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#3B8FC7] hover:bg-[#2C6A99] w-full sm:w-auto">
          <FileText className="size-4 mr-2" />
          {showForm ? 'Cancel' : 'Log New Complaint'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-8 border-[#3B8FC7]/30">
          <CardHeader className="bg-[#E8F4FB]">
            <CardTitle>Submit a Complaint</CardTitle>
            <CardDescription>Provide details about your issue and we'll address it promptly</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="size-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="size-8 text-green-600" />
                </div>
                <h2 className="text-2xl mb-2">Complaint Submitted Successfully!</h2>
                <p className="text-gray-600">Our team will review and respond within 24-48 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Complaint Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="billing">Billing Issue</SelectItem>
                        <SelectItem value="service">Service Quality</SelectItem>
                        <SelectItem value="network">Network Issue</SelectItem>
                        <SelectItem value="support">Support Issue</SelectItem>
                        <SelectItem value="technical">Technical Problem</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger id="priority">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High - Urgent</SelectItem>
                        <SelectItem value="medium">Medium - Important</SelectItem>
                        <SelectItem value="low">Low - Can Wait</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Issue Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of the issue"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Detailed Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about the issue..."
                    rows={6}
                    className="resize-none"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-end pt-4">
                  <Button type="submit" className="bg-[#3B8FC7] hover:bg-[#2C6A99] w-full sm:w-auto" disabled={submitting}>
                    {submitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
                    {submitting ? 'Submitting...' : 'Submit Complaint'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xl">Your Complaints History</h2>
        
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8 gap-2 text-gray-600">
                <Loader2 className="size-5 animate-spin" />
                Loading complaints...
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-red-600 py-8">{error}</p>
            </CardContent>
          </Card>
        ) : accountComplaints.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-600 py-8">
                No complaints submitted yet. If you experience any issues, use the button above to log a complaint.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {accountComplaints.map((complaint) => (
              <Card key={complaint.complaintId} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-lg break-words">{complaint.title}</h3>
                        {getStatusBadge(complaint.status)}
                        {getPriorityBadge(complaint.priority)}
                      </div>
                      <p className="text-sm text-gray-600 mb-3 break-words">{complaint.description}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="size-4" />
                          Submitted {format(new Date(complaint.createdAt), 'MMM dd, yyyy')}
                        </span>
                        {complaint.executiveId && (
                          <span>Assigned to executive</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {complaint.resolution && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="size-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-green-900 mb-1">Resolution</p>
                          <p className="text-sm text-green-800">{complaint.resolution}</p>
                          {complaint.resolvedAt && (
                            <p className="text-xs text-green-700 mt-2">
                              Resolved on {format(new Date(complaint.resolvedAt), 'MMM dd, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
