import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Button,
  Input,
  Select,
  Label,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui-components";
import { Car, CalendarDays, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Vehicles() {
  const [showBooking, setShowBooking] = useState(false);

  const handleSubmitBooking = () => {
    setShowBooking(false);
    toast.success("Booking submitted", {
      description: "Your vehicle booking request has been submitted for approval.",
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Vehicle Booking (MVP)</h2>
          <p className="text-sm text-slate-500">Reserve fleet vehicles for corporate visits.</p>
        </div>
        <Button onClick={() => setShowBooking(!showBooking)} className="flex items-center gap-2">
          <Car className="h-4 w-4" /> Book Vehicle
        </Button>
      </div>

      {showBooking && (
        <Card className="border-mtc-blue-100 bg-mtc-blue-50/30 animate-in slide-in-from-top-4">
          <CardHeader>
             <CardTitle>New Booking Request</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Vehicle Type</Label>
                <Select>
                  <option>Sedan (City)</option>
                  <option>SUV (City/Highway)</option>
                  <option>4x4 (Offroad)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Needed</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>Time (From - To)</Label>
                <div className="flex gap-2">
                  <Input type="time" className="flex-1" />
                  <Input type="time" className="flex-1" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Linked Visit</Label>
                <Select>
                  <option>FNB - Head Office (14:00)</option>
                  <option>NamBreweries (10:00)</option>
                  <option>-- Unlinked --</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowBooking(false)}>Cancel</Button>
              <Button onClick={handleSubmitBooking}>Submit Booking</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <Car className="h-5 w-5 text-slate-500" /> Fleet Availability
          </h3>
          {[
            { id: "MTC-001", type: "Toyota Corolla", status: "Available", color: "success" },
            { id: "MTC-002", type: "Ford Hilux 4x4", status: "In Use", color: "warning" },
            { id: "MTC-003", type: "VW Polo", status: "Maintenance", color: "danger" },
            { id: "MTC-004", type: "Toyota Fortuner", status: "Available", color: "success" },
          ].map(v => (
            <div key={v.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="flex flex-col">
                <span className="font-medium text-slate-900">{v.id}</span>
                <span className="text-xs text-slate-500">{v.type}</span>
              </div>
              <Badge variant={v.color as any}>{v.status}</Badge>
            </div>
          ))}
        </div>

        <div className="md:col-span-2">
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <CalendarDays className="h-5 w-5 text-slate-500" /> My Bookings
               </CardTitle>
             </CardHeader>
             <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { date: "Today, 13:30 - 16:00", vehicle: "MTC-001 (Sedan)", dest: "FNB Head Office", status: "Approved" },
                      { date: "Oct 26, 08:00 - 12:00", vehicle: "MTC-004 (4x4)", dest: "O&L Site", status: "Pending" },
                    ].map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{b.date}</TableCell>
                        <TableCell>{b.vehicle}</TableCell>
                        <TableCell className="text-slate-600 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {b.dest}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.status === 'Approved' ? 'success' : 'warning'}>{b.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}