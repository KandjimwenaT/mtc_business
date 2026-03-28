import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { CheckCircle2, Clock, FileText, Send, XCircle, Loader2 } from 'lucide-react';
import { submitAccountRequest, getMyAccountRequests, type AccountRequestRecord } from '../../api/accountRequestApi';
import { format } from 'date-fns';

export function CustomerRequests() {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<AccountRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await getMyAccountRequests();
      setRequests(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!type || !priority || !title || !description) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setSubmitting(true);
      await submitAccountRequest({ type, priority, title, description });
      setSubmitted(true);
      await fetchRequests();
      setTimeout(() => {
        setShowForm(false);
        setSubmitted(false);
        setType('');
        setPriority('');
        setTitle('');
        setDescription('');
      }, 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, {variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any}> = {
      pending: { variant: 'outline', icon: Clock },
      approved: { variant: 'secondary', icon: CheckCircle2 },
      rejected: { variant: 'destructive', icon: XCircle },
      in_progress: { variant: 'default', icon: Clock },
      completed: { variant: 'secondary', icon: CheckCircle2 },
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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2">Account Requests</h1>
          <p className="text-gray-600">Submit and track requests for account changes and services</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#3B8FC7] hover:bg-[#2C6A99]">
          <FileText className="size-4 mr-2" />
          {showForm ? 'Cancel' : 'New Request'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-8 border-[#3B8FC7]/30">
          <CardHeader className="bg-[#E8F4FB]">
            <CardTitle>Submit a Request</CardTitle>
            <CardDescription>Request changes to your account or services</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="size-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="size-8 text-green-600" />
                </div>
                <h2 className="text-2xl mb-2">Request Submitted Successfully!</h2>
                <p className="text-gray-600">Our back office team will process your request shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Request Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new_line">New Line</SelectItem>
                        <SelectItem value="plan_change">Plan Change</SelectItem>
                        <SelectItem value="line_suspension">Line Suspension</SelectItem>
                        <SelectItem value="line_activation">Line Activation</SelectItem>
                        <SelectItem value="plan_upgrade">Plan Upgrade</SelectItem>
                        <SelectItem value="number_change">Number Change</SelectItem>
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
                        <SelectItem value="medium">Medium - Standard</SelectItem>
                        <SelectItem value="low">Low - No Rush</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Request Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your request"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Detailed Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your request..."
                    rows={6}
                    className="resize-none"
                  />
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit" className="bg-[#3B8FC7] hover:bg-[#2C6A99]" disabled={submitting}>
                    {submitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xl">Your Request History</h2>
        
        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8 gap-2 text-gray-600">
                <Loader2 className="size-5 animate-spin" />
                Loading requests...
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-red-600 py-8">{error}</p>
            </CardContent>
          </Card>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-600 py-8">
                No requests submitted yet. Use the button above to submit a new request.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {requests.map((request) => (
              <Card key={request.requestId} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg">{request.title}</h3>
                        {getStatusBadge(request.status)}
                        {getPriorityBadge(request.priority)}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{request.description}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="size-4" />
                          Submitted {format(new Date(request.createdAt), 'MMM dd, yyyy')}
                        </span>
                        {request.processedBy && (
                          <span>Processed by: {request.processedBy}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {request.notes && (
                    <div className={`mt-4 p-4 rounded-lg ${
                      request.status === 'approved' || request.status === 'completed'
                        ? 'bg-green-50 border border-green-200'
                        : request.status === 'rejected'
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-blue-50 border border-blue-200'
                    }`}>
                      <div className="flex items-start gap-2">
                        {request.status === 'approved' || request.status === 'completed' ? (
                          <CheckCircle2 className="size-5 text-green-600 mt-0.5" />
                        ) : request.status === 'rejected' ? (
                          <XCircle className="size-5 text-red-600 mt-0.5" />
                        ) : (
                          <Clock className="size-5 text-blue-600 mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium mb-1">Note from Back Office</p>
                          <p className="text-sm">{request.notes}</p>
                          {request.processedAt && (
                            <p className="text-xs mt-2">
                              {format(new Date(request.processedAt), 'MMM dd, yyyy')}
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
