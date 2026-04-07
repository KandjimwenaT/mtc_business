import type { Dispatch, SetStateAction } from "react";
import { X, Loader2 } from "lucide-react";
import { Button, Input, Select } from "../ui-components";
import type {
  AccountPayload,
  ContractPayload,
  CorporatePayload,
  PersonRecord,
  ServicePayload,
} from "../../api/adminApi";

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

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {wizardStep === 1 ? "Create Corporate" : "Add Account to Corporate"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
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
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Assigned Manager *</label>
                <Select
                  value={corporateForm.managerId ? corporateForm.managerId.toString() : ""}
                  onChange={(e) =>
                    setCorporateForm((f) => ({
                      ...f,
                      managerId: e.target.value ? Number(e.target.value) : 0,
                    }))
                  }
                >
                  <option value="">Select manager...</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.firstName} {manager.lastName}
                      {manager.department ? ` — ${manager.department}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Industry</label>
                <Input
                  value={corporateForm.industry ?? ""}
                  onChange={(e) =>
                    setCorporateForm((f) => ({ ...f, industry: e.target.value }))
                  }
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

        <div className="flex justify-between px-6 py-4 border-t border-slate-200">
          <Button
            variant="outline"
            onClick={() => {
              if (wizardStep === 1 || wizardStep === 2) resetCreateWizard();
              else setWizardStep((s) => s - 1);
            }}
          >
            {wizardStep === 1 || wizardStep === 2 ? "Cancel" : "Back"}
          </Button>
          <Button
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

