import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, Briefcase } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../components/ui-components";
import { getMyProfile, updateMyAvailability, type AvailabilityStatus, type UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";
import { AvailabilityBadge } from "../components/availability-badge";

export default function AdminProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0] || ""}${profile.lastName[0] || ""}` : "..";
  const availability: AvailabilityStatus = profile?.availabilityStatus === "out_of_office" ? "out_of_office" : "available";

  const setAvailability = async (next: AvailabilityStatus) => {
    if (!profile || next === availability || savingStatus) return;
    setSavingStatus(true);
    try {
      const saved = await updateMyAvailability(next);
      setProfile({ ...profile, availabilityStatus: saved });
      toast.success(saved === "out_of_office" ? "You are marked out of office" : "You are marked available");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update availability");
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-normal text-slate-800">Admin Profile</h2>
        <p className="text-sm text-slate-500">
          Work tickets and corporates. Portal users are created by managers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mtc-navy text-xl font-bold text-white">
            {initials}
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-slate-900">{displayName}</p>
              {profile ? <AvailabilityBadge status={availability} /> : null}
            </div>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
            <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-mtc-blue" /> {profile?.department || "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Your executive and manager can see whether you are available or out of office.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={availability === "available" ? "primary" : "outline"}
              disabled={!profile || savingStatus}
              onClick={() => setAvailability("available")}
            >
              Available
            </Button>
            <Button
              type="button"
              variant={availability === "out_of_office" ? "danger" : "outline"}
              disabled={!profile || savingStatus}
              onClick={() => setAvailability("out_of_office")}
            >
              Out of office
            </Button>
          </div>
        </CardContent>
      </Card>

      {profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={setProfile} />
      )}
    </div>
  );
}
