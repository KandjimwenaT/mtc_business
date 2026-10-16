import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { Button, Input, Select } from "../ui-components";
import type {
  AccountPayload,
  ContractPayload,
  CorporatePayload,
  PersonRecord,
  ServicePayload,
} from "../../api/adminApi";
import {
  departmentsMatch,
  isEbuDepartment,
  normalizeDepartmentSegment,
  type DepartmentSegment,
} from "../../utils/departmentSegment";

const INDUSTRY_OPTIONS = [
  "Agriculture",
  "Automotive",
  "Banking & Financial Services",
  "Construction",
  "Education",
  "Energy & Utilities",
  "Engineering",
  "Fisheries",
  "Government & Public Sector",
  "Healthcare",
  "Hospitality & Tourism",
  "Information Technology",
  "Insurance",
  "Manufacturing",
  "Media & Entertainment",
  "Mining",
  "NGOs & Non-Profit",
  "Oil & Gas",
  "Professional Services",
  "Real Estate",
  "Retail & Wholesale",
  "Telecommunications",
  "Transportation & Logistics",
  "Travel & Aviation",
  "Other",
] as const;

function SearchableIndustrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INDUSTRY_OPTIONS;
    return INDUSTRY_OPTIONS.filter((item) => item.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery("");
        }}
        className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-mtc-blue"
      >
        <span className={value ? "text-slate-900 truncate" : "text-slate-400"}>
          {value || "Search industry..."}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No matching industry</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50"
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>{item}</span>
                  {value === item ? <Check className="h-4 w-4 text-mtc-blue" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pickManagerId(
  managers: PersonRecord[],
  segment: DepartmentSegment | "",
  executives: PersonRecord[],
  currentUserEmail?: string
): number {
  if (!segment) return 0;
  if (currentUserEmail) {
    const me = executives.find(
      (e) => e.email?.toLowerCase() === currentUserEmail.toLowerCase()
    );
    if (me?.managerId) {
      const mgr = managers.find((m) => m.id === me.managerId);
      if (mgr && departmentsMatch(mgr.department, segment)) return mgr.id;
    }
  }
  const matches = managers.filter((m) => departmentsMatch(m.department, segment));
  return matches[0]?.id ?? 0;
}

type ChildAccountExtraForm = {
  billCycleDay: string;
  currentServiceOwner: string;
  serviceStatus: "active" | "suspended" | "inactive";
  expired: "yes" | "no";
};

type Props = {
  show: boolean;
  wizardStep: number;
  setWizardStep: Dispatch<SetStateAction<number>>;
  resetCreateWizard: () => void;
  submittingWizard: boolean;
  managers: PersonRecord[];
  executives: PersonRecord[];
  userDepartment: DepartmentSegment | null;
  currentUserEmail?: string;
  corporateForm: CorporatePayload;
  setCorporateForm: Dispatch<SetStateAction<CorporatePayload>>;
  childAccountForm: AccountPayload;
  setChildAccountForm: Dispatch<SetStateAction<AccountPayload>>;
  childAccountExtraForm: ChildAccountExtraForm;
  setChildAccountExtraForm: Dispatch<SetStateAction<ChildAccountExtraForm>>;
  contractForm: ContractPayload;
  setContractForm: Dispatch<SetStateAction<ContractPayload>>;
  serviceLines: ServicePayload[];
  setServiceLines: Dispatch<SetStateAction<ServicePayload[]>>;
  handleCreateCorporateStep: () => void | Promise<void>;
  handleCreateAccountStep: () => void | Promise<void>;
  handleCreateContractStep: () => void | Promise<void>;
  handleCreateServicesStep: () => void | Promise<void>;
};

export default function AdminCorporateWizard(props: Props) {
  const {
    show,
    wizardStep,
    setWizardStep,
    resetCreateWizard,
    submittingWizard,
    managers,
    executives,
    userDepartment,
    currentUserEmail,
    corporateForm,
    setCorporateForm,
    childAccountForm,
    setChildAccountForm,
    childAccountExtraForm,
    setChildAccountExtraForm,
    contractForm,
    setContractForm,
    serviceLines,
    setServiceLines,
    handleCreateCorporateStep,
    handleCreateAccountStep,
    handleCreateContractStep,
    handleCreateServicesStep,
  } = props;

  const [segment, setSegment] = useState<DepartmentSegment | "">(userDepartment ?? "");

  useEffect(() => {
    if (!show) return;
    setSegment(userDepartment ?? "");
  }, [show, userDepartment]);

  useEffect(() => {
    if (!show || wizardStep !== 1) return;
    const nextSegment = (userDepartment || segment) as DepartmentSegment | "";
    const managerId = pickManagerId(managers, nextSegment, executives, currentUserEmail);
    const me = currentUserEmail
      ? executives.find((e) => e.email?.toLowerCase() === currentUserEmail.toLowerCase())
      : undefined;

    setCorporateForm((f) => {
      const next: CorporatePayload = { ...f, managerId };
      if (nextSegment !== "EBU") {
        next.executiveId = null;
      } else if (!f.executiveId && me && me.managerId === managerId) {
        next.executiveId = me.id;
      }
      if (f.managerId === next.managerId && f.executiveId === next.executiveId) return f;
      return next;
    });
  }, [
    show,
    wizardStep,
    userDepartment,
    segment,
    managers,
    executives,
    currentUserEmail,
    setCorporateForm,
  ]);

  const assignedManager = managers.find((m) => m.id === corporateForm.managerId) ?? null;
  const effectiveSegment =
    userDepartment ||
    segment ||
    normalizeDepartmentSegment(assignedManager?.department);

  const ebuExecutives = useMemo(() => {
    return executives.filter((e) => {
      if (e.managerId == null) return false;
      const mgr = managers.find((m) => m.id === e.managerId);
      if (!isEbuDepartment(mgr?.department)) return false;
      if (corporateForm.managerId) return e.managerId === corporateForm.managerId;
      return true;
    });
  }, [executives, managers, corporateForm.managerId]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-4 sm:py-8 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 break-words">
              {wizardStep === 1 ? "Create Corporate" : "Add Account to Corporate"}
            </h2>
            <p className="text-sm text-slate-500 mt-1 break-words">
              {wizardStep === 1
                ? "Corporate details"
                : `Step ${wizardStep - 1} of 3: ${
                    wizardStep === 2
                      ? "Account"
                      : wizardStep === 3
                        ? "Contract"
                        : "Service Lines"
                  }`}
            </p>
          </div>
          <button
            onClick={resetCreateWizard}
            className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {wizardStep === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Corporate Name *</label>
                <Input
                  value={corporateForm.corporateName}
                  onChange={(e) => setCorporateForm((f) => ({ ...f, corporateName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Corporate Number *</label>
                <Input
                  value={corporateForm.corporateNumber}
                  onChange={(e) =>
                    setCorporateForm((f) => ({ ...f, corporateNumber: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Corporate Type *</label>
                <Select
                  value={corporateForm.corporateType}
                  onChange={(e) =>
                    setCorporateForm((f) => ({ ...f, corporateType: e.target.value }))
                  }
                >
                  <option value="">Select type...</option>
                  <option value="Corporate">Corporate</option>
                  <option value="SME">SME</option>
                  <option value="Government">Government</option>
                  <option value="Retail">Retail</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Business Email *</label>
                <Input
                  type="email"
                  value={corporateForm.businessEmail}
                  onChange={(e) =>
                    setCorporateForm((f) => ({ ...f, businessEmail: e.target.value }))
                  }
                />
              </div>
              {!userDepartment && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Segment *</label>
                  <Select
                    value={segment}
                    onChange={(e) => {
                      const next = e.target.value as DepartmentSegment | "";
                      setSegment(next);
                      setCorporateForm((f) => ({
                        ...f,
                        executiveId: next === "EBU" ? f.executiveId : null,
                      }));
                    }}
                  >
                    <option value="">Select segment...</option>
                    <option value="Key Accounts">Key Accounts</option>
                    <option value="EBU">EBU</option>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Assigned Manager *</label>
                <Input
                  readOnly
                  disabled
                  value={
                    assignedManager
                      ? `${assignedManager.firstName} ${assignedManager.lastName}${
                          assignedManager.department ? ` — ${assignedManager.department}` : ""
                        }`
                      : effectiveSegment
                        ? `No ${effectiveSegment} manager found`
                        : "Select a segment to auto-assign a manager"
                  }
                />
              </div>
              {effectiveSegment === "EBU" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">EBU Executive *</label>
                  <Select
                    value={corporateForm.executiveId ? String(corporateForm.executiveId) : ""}
                    onChange={(e) =>
                      setCorporateForm((f) => ({
                        ...f,
                        executiveId: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Select EBU executive...</option>
                    {ebuExecutives.map((exec) => (
                      <option key={exec.id} value={exec.id}>
                        {exec.firstName} {exec.lastName}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Industry</label>
                <SearchableIndustrySelect
                  value={corporateForm.industry ?? ""}
                  onChange={(industry) => setCorporateForm((f) => ({ ...f, industry }))}
                />
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Account Name *</label>
                <Input
                  value={childAccountForm.accountName}
                  onChange={(e) =>
                    setChildAccountForm((f) => ({ ...f, accountName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Account Number *</label>
                <Input
                  value={childAccountForm.accountNumber}
                  onChange={(e) =>
                    setChildAccountForm((f) => ({ ...f, accountNumber: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Account Type *</label>
                <Select
                  value={childAccountForm.accountType}
                  onChange={(e) =>
                    setChildAccountForm((f) => ({ ...f, accountType: e.target.value }))
                  }
                >
                  <option value="">Select type...</option>
                  <option value="Corporate">Business</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">BILL_CYCLE_DAY</label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={childAccountExtraForm.billCycleDay}
                  onChange={(e) =>
                    setChildAccountExtraForm((f) => ({ ...f, billCycleDay: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">CURRENT_SERVICE_OWNER</label>
                <Input
                  value={childAccountExtraForm.currentServiceOwner}
                  onChange={(e) =>
                    setChildAccountExtraForm((f) => ({
                      ...f,
                      currentServiceOwner: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">SERVICE_STATUS</label>
                <Select
                  value={childAccountExtraForm.serviceStatus}
                  onChange={(e) =>
                    setChildAccountExtraForm((f) => ({
                      ...f,
                      serviceStatus: e.target.value as "active" | "suspended" | "inactive",
                    }))
                  }
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="inactive">inactive</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">EXPIRED</label>
                <Select
                  value={childAccountExtraForm.expired}
                  onChange={(e) =>
                    setChildAccountExtraForm((f) => ({
                      ...f,
                      expired: e.target.value as "yes" | "no",
                    }))
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Contract Type *</label>
                <Select
                  value={contractForm.contractType}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, contractType: e.target.value }))
                  }
                >
                  <option value="">Select type...</option>
                  <option value="Postpaid">Postpaid</option>
                  <option value="Prepaid">Prepaid</option>
                  <option value="Fixed Term">Fixed Term</option>
                  <option value="Month-to-Month">Month-to-Month</option>
                  <option value="Government">Government</option>
                  <option value="SLA Agreement">SLA Agreement</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Start Date</label>
                <Input
                  type="date"
                  value={contractForm.contractStartDate ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, contractStartDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">End Date</label>
                <Input
                  type="date"
                  value={contractForm.contractEndDate ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, contractEndDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Effective Date</label>
                <Input
                  type="date"
                  value={contractForm.contractEffectiveDate ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({
                      ...f,
                      contractEffectiveDate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">SR Number</label>
                <Input
                  value={contractForm.srNumber ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, srNumber: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">SR Created Date</label>
                <Input
                  type="date"
                  value={contractForm.srCreatedDate ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, srCreatedDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">SR Submitted Date</label>
                <Input
                  type="date"
                  value={contractForm.srSubmittedDate ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, srSubmittedDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">SR Accepted Date</label>
                <Input
                  type="date"
                  value={contractForm.srAcceptedDate ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, srAcceptedDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Usage Limit</label>
                <Input
                  placeholder="e.g 20000"
                  value={contractForm.usageLimit ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, usageLimit: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Entitlement</label>
                <Input
                  placeholder="e.g 30076387330"
                  value={contractForm.entitlement ?? ""}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, entitlement: e.target.value }))
                  }
                />
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-4">
              {serviceLines.map((line, idx) => (
                <div key={idx} className="grid gap-3 md:grid-cols-3 p-3 border border-slate-200 rounded-lg">
                  <Input
                    placeholder="Cellphone Number (optional)"
                    value={line.msisdn ?? ""}
                    onChange={(e) =>
                      setServiceLines((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, msisdn: e.target.value } : item)),
                      )
                    }
                  />
                  <Select
                    value={line.serviceType}
                    onChange={(e) =>
                      setServiceLines((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, serviceType: e.target.value } : item,
                        ),
                      )
                    }
                  >
                    <option value="">Select service type...</option>
                    <option value="Mobile Voice">Mobile Voice</option>
                    <option value="Fiber Internet">Fiber Internet</option>
                    <option value="LTE Data">LTE Data</option>
                    <option value="MPLS VPN">MPLS VPN</option>
                    <option value="Cloud Services">Cloud Services</option>
                    <option value="IoT">IoT</option>
                    <option value="Server Colocation">Server Colocation</option>
                    <option value="Other">Other</option>
                  </Select>
                  <Select
                    value={line.status ?? "active"}
                    onChange={(e) =>
                      setServiceLines((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? { ...item, status: e.target.value as ServicePayload["status"] }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setServiceLines((prev) => [...prev, { msisdn: "", serviceType: "", status: "active" }])
                }
              >
                Add Another Service Line
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 px-4 sm:px-6 py-4 border-t border-slate-200 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              if (wizardStep === 1 || wizardStep === 2) resetCreateWizard();
              else setWizardStep((s) => s - 1);
            }}
          >
            {wizardStep === 1 || wizardStep === 2 ? "Cancel" : "Back"}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              if (wizardStep === 1) handleCreateCorporateStep();
              else if (wizardStep === 2) handleCreateAccountStep();
              else if (wizardStep === 3) handleCreateContractStep();
              else handleCreateServicesStep();
            }}
            disabled={submittingWizard}
          >
            {submittingWizard ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
              </>
            ) : wizardStep === 1 ? (
              "Create Corporate"
            ) : wizardStep === 4 ? (
              "Finish"
            ) : (
              "Next"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

