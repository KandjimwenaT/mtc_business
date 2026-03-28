// Type definitions for the MTC Business Portal

export interface MTCAccount {
  id: string;
  phoneNumber: string;
  accountType: 'postpaid' | 'prepaid';
  plan: string;
  status: 'active' | 'suspended' | 'inactive';
  monthlyCharges: number;
  dataUsage: number; // in GB
  voiceUsage: number; // in minutes
  assignedTo?: string; // Employee name
  department?: string;
}

export interface CorporateAccount {
  id: string;
  companyName: string;
  industry: string;
  accountValue: number;
  status: 'active' | 'inactive' | 'pending';
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  executiveId: string;
  since: string;
  mtcAccounts: MTCAccount[]; // MTC accounts under this corporate account
  billingAddress?: string;
  totalMTCLines: number;
}

export interface Engagement {
  id: string;
  accountId: string;
  type: 'meeting' | 'call' | 'email' | 'presentation' | 'support';
  title: string;
  description: string;
  date: string;
  status: 'completed' | 'scheduled' | 'cancelled';
  executiveId: string;
  duration?: number; // in minutes
  notes?: string;
  location?: string; // Physical address, online link, or 'customer_site'
  locationType?: 'office' | 'online' | 'customer_site';
  ratingRequested?: boolean;
}

export interface Rating {
  id: string;
  accountId: string;
  executiveId: string;
  engagementId: string;
  score: number; // 1-5
  feedback: string;
  category: string;
  submittedAt: string;
  submittedBy: string;
}

export interface ActionItem {
  id: string;
  type: 'account_issue' | 'rating_concern' | 'engagement_followup' | 'contract_renewal';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  accountId: string;
  executiveId: string;
  status: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;
  dueDate: string;
  assignedTo?: string;
}

export interface Executive {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  accountsManaged: number;
  status: 'in_office' | 'out_of_office' | 'on_leave' | 'meeting' | 'field_visit';
  statusUpdatedAt?: string;
}

export interface Complaint {
  id: string;
  accountId: string;
  type: 'billing' | 'service' | 'network' | 'support' | 'technical' | 'other';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  submittedBy: string;
  submittedAt: string;
  assignedTo?: string;
  resolvedAt?: string;
  resolution?: string;
  mtcAccountId?: string;
}

export interface AccountRequest {
  id: string;
  accountId: string;
  type: 'new_line' | 'plan_change' | 'line_suspension' | 'line_activation' | 'plan_upgrade' | 'number_change' | 'other';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_progress' | 'completed';
  submittedBy: string;
  submittedAt: string;
  processedBy?: string;
  processedAt?: string;
  notes?: string;
  mtcAccountId?: string;
}

export interface Ticket {
  ticketId: number;
  ticketNumber: string;
  category: 'request' | 'complaint';
  accountId: number;
  executiveId: number | null;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string | null;
  status: 'new' | 'assigned' | 'in_progress' | 'escalated' | 'resolved' | 'closed' | 'rejected';
  submittedBy: string;
  assignedTo: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  accountName?: string;
  accountNumber?: string;
}

export interface CustomerVisit {
  id: string;
  accountId: string;
  corporateName: string;
  executiveName: string;
  executiveEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  purpose: string;
  agenda: string;
  attendees: string[];
  status: 'pending' | 'approved' | 'declined' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
  customerResponse?: string;
  customerRespondedAt?: string;
}