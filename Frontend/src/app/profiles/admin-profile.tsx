import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui-components";
import { getMyProfile, type UserProfile } from "../api/authApi";
import ProfileEditSection from "../components/profile-edit-section";

export default function AdminProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => toast.error("Failed to load profile"));
  }, []);

  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "Loading...";
  const initials = profile ? `${profile.firstName[0] || ""}${profile.lastName[0] || ""}` : "..";

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
            <p className="text-base font-semibold text-slate-900">{displayName}</p>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-mtc-blue" /> {profile?.email || "—"}</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-mtc-blue" /> {profile?.phone || "—"}</div>
            <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-mtc-blue" /> {profile?.department || "—"}</div>
          </div>
        </CardContent>
      </Card>

      {profile && (
        <ProfileEditSection profile={profile} onProfileUpdated={setProfile} />
      )}
    </div>
  );
}
