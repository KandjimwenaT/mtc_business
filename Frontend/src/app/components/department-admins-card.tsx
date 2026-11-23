import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui-components";
import { getDepartmentAdmins, type DepartmentAdmin } from "../api/authApi";
import { AvailabilityBadge } from "./availability-badge";

export default function DepartmentAdminsCard() {
  const [admins, setAdmins] = useState<DepartmentAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDepartmentAdmins()
      .then(setAdmins)
      .catch(() => toast.error("Failed to load admin availability"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Admin availability</CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          Admins on your team can mark themselves available or out of office.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-500">Loading admins...</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-slate-500">No admins are linked to your team yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {admins.map((admin) => (
              <div key={admin.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mtc-blue-50 text-sm font-bold text-mtc-blue">
                  {(admin.firstName[0] || "") + (admin.lastName[0] || "")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {admin.firstName} {admin.lastName}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                    <Mail className="h-3 w-3 shrink-0" /> {admin.email}
                  </p>
                </div>
                <AvailabilityBadge status={admin.availabilityStatus} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
