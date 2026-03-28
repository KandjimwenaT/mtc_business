import { useState } from "react";
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
} from "./ui-components";
import { Plus, Calendar, MapPin, CheckCircle, Search, Star, MessageSquare, X } from "lucide-react";
import { getCurrentUser } from "../api/authApi";

interface VisitHistoryItem {
  date: string;
  corp: string;
  type: string;
  exec: string;
  rating: number;
}

export default function Visits() {
  const [activeTab, setActiveTab] = useState("upcoming");
  const [showControlCard, setShowControlCard] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showViewCard, setShowViewCard] = useState<VisitHistoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [controlCardVisit, setControlCardVisit] = useState("");

  const currentUser = getCurrentUser();
  const [rescheduleRequests, setRescheduleRequests] = useState<{
    id: number;
    executive: string;
    corp: string;
    originalDate: string;
    requestedDate: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
  }[]>([
    { id: 1, executive: "Jane Smith",   corp: "First National Bank",   originalDate: "Mar 15, 2026", requestedDate: "Mar 20, 2026", reason: "Customer requested change due to internal board meeting",    status: "pending" },
    { id: 2, executive: "John Doe",     corp: "Ministry of Finance",   originalDate: "Mar 16, 2026", requestedDate: "Mar 18, 2026", reason: "Executive vehicle unavailable for field visit",             status: "pending" },
    { id: 3, executive: "Sarah Lee",    corp: "Air Namibia",           originalDate: "Mar 17, 2026", requestedDate: "Mar 22, 2026", reason: "Customer site undergoing scheduled maintenance",            status: "pending" },
  ]);

  const upcomingVisits = [
    { id: 1, corp: "First National Bank", time: "Today, 14:00", location: "FNB Head Office, Windhoek", agenda: "Q3 Service Review & Renewal Discussion", attendees: "Jane Doe (IT Director), Mark Smith", variant: "warning" as const },
    { id: 2, corp: "Namibia Breweries", time: "Tomorrow, 09:00", location: "NamBrew Factory, Windhoek", agenda: "Issue Resolution Follow-up", attendees: "Peter Müller (CTO)", variant: "default" as const },
  ];

  const historyData: VisitHistoryItem[] = [
    { date: "Oct 23, 2024", corp: "Namibia Breweries", type: "Scheduled Review", exec: "Jane Smith", rating: 5 },
    { date: "Oct 21, 2024", corp: "Ohlthaver & List", type: "Issue Resolution", exec: "Jane Smith", rating: 2 },
    { date: "Oct 15, 2024", corp: "Ministry of Finance", type: "Sales Pitch", exec: "John Doe", rating: 4 },
  ];

  const filteredVisits = upcomingVisits.filter(v =>
    searchQuery === "" ||
    v.corp.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleScheduleVisit = () => {
    setShowSchedule(false);
    toast.success("Visit scheduled", {
      description: "New visit has been added to your calendar and notifications sent to attendees.",
    });
  };

  const handleReschedule = (corp: string) => {
    toast.info("Reschedule request sent", {
      description: `A reschedule request for ${corp} has been sent. The customer will be notified.`,
    });
  };

  const handleSubmitControlCard = (corp: string) => {
    setControlCardVisit(corp);
    setShowControlCard(false);
    setShowRating(true);
  };

  const handleSubmitRating = () => {
    setShowRating(false);
    if (rating <= 2) {
      toast.warning("Low rating submitted", {
        description: "Rating escalation triggered — Supervisor and Management have been notified.",
      });
    } else {
      toast.success("Rating submitted", {
        description: `Thank you! ${rating}/5 rating recorded for ${controlCardVisit || "the visit"}.`,
      });
    }
    setRating(0);
    setControlCardVisit("");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Visits & Engagements</h2>
          <p className="text-sm text-slate-500">Manage client visits, control cards, and feedback ratings.</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setShowSchedule(!showSchedule)}>
          <Plus className="h-4 w-4" /> Schedule Visit
        </Button>
      </div>

      {showSchedule && (
        <Card className="border-mtc-blue-100 bg-mtc-blue-50/30 animate-in slide-in-from-top-4">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Schedule New Visit</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowSchedule(false)}>Cancel</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Corporate Customer <span className="text-red-500">*</span></Label>
                <Select>
                  <option value="">Select Corporate...</option>
                  <option>First National Bank</option>
                  <option>Namibia Breweries</option>
                  <option>Ministry of Finance</option>
                  <option>Ohlthaver & List</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Visit Date <span className="text-red-500">*</span></Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>Visit Time <span className="text-red-500">*</span></Label>
                <Input type="time" />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="e.g. Head Office, Windhoek" />
              </div>
              <div className="space-y-2">
                <Label>Agenda Template</Label>
                <Select>
                  <option value="">Select Agenda...</option>
                  <option>Quarterly Service Review</option>
                  <option>Issue Resolution Follow-up</option>
                  <option>New Product Demo</option>
                  <option>Renewal Discussion</option>
                  <option>Courtesy Visit</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Attendees</Label>
                <Input placeholder="e.g. John Smith (IT Director)" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancel</Button>
              <Button onClick={handleScheduleVisit}>Schedule Visit</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manager: Pending Reschedule Requests */}
      {currentUser?.role === "manager" && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" />
              Pending Reschedule Requests
              {rescheduleRequests.filter((r) => r.status === "pending").length > 0 && (
                <Badge variant="warning" className="ml-2">
                  {rescheduleRequests.filter((r) => r.status === "pending").length} Pending
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Executive</TableHead>
                <TableHead>Corporate</TableHead>
                <TableHead>Original Date</TableHead>
                <TableHead>Requested Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rescheduleRequests.filter((r) => r.status === "pending").map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium text-slate-900">{req.executive}</TableCell>
                  <TableCell>{req.corp}</TableCell>
                  <TableCell className="text-slate-500">{req.originalDate}</TableCell>
                  <TableCell className="font-medium">{req.requestedDate}</TableCell>
                  <TableCell className="text-sm text-slate-500 max-w-xs truncate">{req.reason}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 border-green-300 hover:bg-green-50 text-xs"
                        onClick={() => {
                          setRescheduleRequests((prev) =>
                            prev.map((r) => r.id === req.id ? { ...r, status: "approved" as const } : r)
                          );
                          toast.success(`Reschedule approved for ${req.corp}`, {
                            description: `${req.executive} notified. New date: ${req.requestedDate}`,
                          });
                        }}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-700 border-red-300 hover:bg-red-50 text-xs"
                        onClick={() => {
                          setRescheduleRequests((prev) =>
                            prev.map((r) => r.id === req.id ? { ...r, status: "rejected" as const } : r)
                          );
                          toast.error(`Reschedule rejected for ${req.corp}`, {
                            description: `${req.executive} notified. Original date stands.`,
                          });
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rescheduleRequests.filter((r) => r.status === "pending").length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-400">
                    No pending reschedule requests.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "upcoming" ? "border-mtc-blue text-mtc-blue" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}`}
        >
          Upcoming Visits
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
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Scheduled for this week</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                className="pl-9 w-64"
                placeholder="Search visits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredVisits.map((visit) => (
              <Card key={visit.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">{visit.corp}</CardTitle>
                    <Badge variant={visit.variant}>{visit.time}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" /> {visit.location}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="space-y-2 text-sm text-slate-700 my-4">
                    <p><strong>Agenda:</strong> {visit.agenda}</p>
                    <p><strong>Attendees:</strong> {visit.attendees}</p>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                    <Button variant="outline" className="flex-1 text-xs" onClick={() => handleReschedule(visit.corp)}>
                      Reschedule
                    </Button>
                    <Button 
                      className="flex-1 text-xs bg-slate-800" 
                      onClick={() => { setControlCardVisit(visit.corp); setShowControlCard(true); }}
                    >
                      Start Visit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredVisits.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                No visits match your search.
              </div>
            )}
          </div>
        </div>
      )}

      {showControlCard && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="sticky top-0 bg-white border-b border-slate-200 z-10 flex flex-row items-center justify-between py-4">
              <CardTitle>Complete Control Card — {controlCardVisit}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowControlCard(false)}>Close</Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="bg-mtc-blue-50 border border-mtc-blue-100 rounded-md p-4 flex items-start gap-3">
                 <CheckCircle className="h-5 w-5 text-mtc-blue mt-0.5" />
                 <div>
                   <h4 className="font-semibold text-mtc-blue-dark">Presence Verified</h4>
                   <p className="text-sm text-mtc-blue">GPS location confirmed at customer premises. Time tracking started.</p>
                 </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Engagement Type *</Label>
                  <Select>
                    <option>Scheduled Review</option>
                    <option>Issue Resolution</option>
                    <option>Sales Pitch</option>
                    <option>Courtesy Visit</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Product Area Focus *</Label>
                  <Select multiple className="h-auto py-2">
                    <option>Mobile Voice</option>
                    <option>Fiber Internet</option>
                    <option>Cloud Services</option>
                    <option>IoT Solutions</option>
                  </Select>
                  <p className="text-xs text-slate-500">Hold Ctrl/Cmd to select multiple</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Issues Identified? *</Label>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="issues" value="yes" /> Yes</label>
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="issues" value="no" defaultChecked /> No</label>
                  </div>
                  <Select disabled>
                    <option>Select Root Cause...</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Opportunities Identified</Label>
                  <Select>
                    <option>None</option>
                    <option>Upgrade to Fiber 100Mbps</option>
                    <option>Add 50 Mobile Lines</option>
                    <option>Server Colocation</option>
                  </Select>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Next Actions *</Label>
                  <div className="flex gap-2">
                    <Select className="flex-1">
                      <option>Send Proposal</option>
                      <option>Schedule Technical Survey</option>
                      <option>Follow up call in 1 week</option>
                      <option>Close Engagement</option>
                    </Select>
                    <Input type="date" className="w-40" />
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
                  <Label>Brief Notes (Optional)</Label>
                  <textarea 
                    className="flex min-h-[60px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                    placeholder="Avoid free text where possible..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => { setShowControlCard(false); toast.info("Draft saved", { description: "Control card has been saved as draft." }); }}>
                  Save Draft
                </Button>
                <Button onClick={() => handleSubmitControlCard(controlCardVisit)}>Submit & Request Rating</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showRating && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
           <Card className="w-full max-w-md">
             <CardHeader className="text-center">
               <CardTitle>Post-Visit Feedback</CardTitle>
               <p className="text-sm text-slate-500 mt-2">Simulating the email/SMS link sent to the customer.</p>
             </CardHeader>
             <CardContent className="space-y-6">
               <div className="flex justify-center gap-2">
                 {[1, 2, 3, 4, 5].map((star) => (
                   <button 
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-2 transition-transform hover:scale-110 focus:outline-none"
                   >
                     <Star 
                      className={`h-10 w-10 ${rating >= star ? 'fill-blue-400 text-blue-400' : 'text-slate-200'} `} 
                     />
                   </button>
                 ))}
               </div>

               {rating > 0 && rating <= 2 && (
                 <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 animate-in slide-in-from-top-2">
                   <strong>Low Rating Alert:</strong> This will trigger an automatic escalation to Supervisor and Management.
                 </div>
               )}

               <div className="space-y-4">
                 <div className="space-y-2">
                   <Label>Primary Reason Code *</Label>
                   <Select>
                     <option>Select Reason...</option>
                     <option>Executive Professionalism</option>
                     <option>Issue Not Resolved</option>
                     <option>Product Knowledge</option>
                     <option>Punctuality</option>
                     <option>Excellent Service</option>
                   </Select>
                 </div>

                 {rating > 0 && rating <= 3 && (
                   <div className="space-y-2">
                     <Label className="flex items-center gap-2">
                       <MessageSquare className="h-4 w-4" /> 
                       Mandatory Comment
                     </Label>
                     <textarea 
                       className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mtc-blue"
                       placeholder="Please provide details for the low rating..."
                       required
                     />
                   </div>
                 )}
               </div>

               <div className="flex gap-2">
                 <Button variant="outline" className="flex-1" onClick={() => { setShowRating(false); setRating(0); }}>Cancel</Button>
                 <Button className="flex-1" onClick={handleSubmitRating} disabled={rating === 0}>Submit Rating</Button>
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
