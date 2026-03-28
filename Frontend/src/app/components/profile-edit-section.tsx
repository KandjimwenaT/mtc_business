import React, { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Badge } from "./ui-components";
import { updateMyProfile, changePassword } from "../api/authApi";
import type { UserProfile } from "../api/authApi";

interface ProfileEditSectionProps {
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
  readOnlyProfile?: boolean;
}

export default function ProfileEditSection({ profile, onProfileUpdated, readOnlyProfile = false }: ProfileEditSectionProps) {
  // ── Personal Info Edit State ──
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Password Change State ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const formatRole = (role: string) => role.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      onProfileUpdated(updated);
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setPhone(profile.phone || "");
    setIsEditing(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Current password is required");
      return;
    }
    if (!newPassword) {
      toast.error("New password is required");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Personal Information ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Personal Information</CardTitle>
            {!readOnlyProfile && (
              !isEditing ? (
                <Button variant="outline" className="text-sm" onClick={() => setIsEditing(true)}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="text-sm" onClick={handleCancelEdit} disabled={savingProfile}>
                    Cancel
                  </Button>
                  <Button className="text-sm bg-[#E5251E] hover:bg-[#E5251E]/90 text-white" onClick={handleSaveProfile} disabled={savingProfile}>
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-500">First Name</Label>
              {isEditing ? (
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1" />
              ) : (
                <p className="text-sm font-medium mt-1">{profile.firstName}</p>
              )}
            </div>
            <div>
              <Label className="text-sm text-gray-500">Last Name</Label>
              {isEditing ? (
                <Input value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1" />
              ) : (
                <p className="text-sm font-medium mt-1">{profile.lastName}</p>
              )}
            </div>
            <div>
              <Label className="text-sm text-gray-500">Email</Label>
              <p className="text-sm font-medium mt-1">{profile.email}</p>
              {isEditing && <p className="text-xs text-gray-400 mt-0.5">Email cannot be changed</p>}
            </div>
            <div>
              <Label className="text-sm text-gray-500">Phone</Label>
              {isEditing ? (
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter phone number" className="mt-1" />
              ) : (
                <p className="text-sm font-medium mt-1">{profile.phone || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-sm text-gray-500">Role</Label>
              <div className="mt-1">
                <Badge className="bg-blue-100 text-blue-800">{formatRole(profile.role)}</Badge>
              </div>
            </div>
            {profile.department && (
              <div>
                <Label className="text-sm text-gray-500">Department</Label>
                <p className="text-sm font-medium mt-1">{profile.department}</p>
              </div>
            )}
            {profile.region && (
              <div>
                <Label className="text-sm text-gray-500">Region</Label>
                <p className="text-sm font-medium mt-1">{profile.region}</p>
              </div>
            )}
            {profile.personId && (
              <div>
                <Label className="text-sm text-gray-500">Employee ID</Label>
                <p className="text-sm font-medium mt-1">EMP-{profile.personId}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Change Password ── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm text-gray-500">Current Password</Label>
            <div className="relative mt-1">
              <Input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">New Password</Label>
            <div className="relative mt-1">
              <Input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-sm text-gray-500">Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mt-1"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>
          <div className="pt-2">
            <Button
              className="w-full bg-[#E5251E] hover:bg-[#E5251E]/90 text-white"
              onClick={handleChangePassword}
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {savingPassword ? "Changing Password..." : "Change Password"}
            </Button>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 mt-2">
            <p className="text-xs text-gray-500 font-medium mb-1">Password Requirements:</p>
            <ul className="text-xs text-gray-400 space-y-0.5 list-disc list-inside">
              <li>At least 8 characters long</li>
              <li>Include uppercase and lowercase letters</li>
              <li>Include at least one number</li>
              <li>Include at least one special character</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
