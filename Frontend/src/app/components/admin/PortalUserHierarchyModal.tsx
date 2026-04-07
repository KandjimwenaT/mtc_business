import { useMemo } from "react";
import type { PortalUser, PersonRecord } from "../../api/adminApi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui-components";
import { X, User, Building2, Users, Shield, Loader2 } from "lucide-react";

function safeParseIdArray(region: string | null | undefined): number[] {
  if (!region) return [];
  try {
    const parsed = JSON.parse(region);
    return Array.isArray(parsed) ? parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

type Props = {
  user: PortalUser;
  onClose: () => void;
  loading?: boolean;
  gmPersons: PersonRecord[];
  managerPersons: PersonRecord[];
  supervisorPersons: PersonRecord[];
  executivePersons: PersonRecord[];
  adminPersons: PersonRecord[];
};

export default function PortalUserHierarchyModal({
  user,
  onClose,
  loading,
  gmPersons,
  managerPersons,
  supervisorPersons,
  executivePersons,
  adminPersons,
}: Props) {
  const allPersons = useMemo(
    () => [...gmPersons, ...managerPersons, ...supervisorPersons, ...executivePersons, ...adminPersons],
    [gmPersons, managerPersons, supervisorPersons, executivePersons, adminPersons]
  );

  const person = useMemo(() => allPersons.find((p) => p.email === user.email) ?? null, [allPersons, user.email]);

  const personById = useMemo(() => {
    const map = new Map<number, PersonRecord>();
    for (const p of allPersons) map.set(p.id, p);
    return map;
  }, [allPersons]);

  const hierarchy = useMemo(() => {
    if (!person) return null;

    const gmFromManager = (managerPersonId: number | null | undefined) => {
      if (!managerPersonId) return null;
      const managerPerson = personById.get(managerPersonId);
      if (!managerPerson) return null;
      if (!managerPerson.gmId) return null;
      return personById.get(managerPerson.gmId) ?? null;
    };

    if (person.type === "executive_staff") {
      const manager = personById.get(person.managerId ?? -1) ?? null;
      const gm = gmFromManager(person.managerId) ?? null;

      const linkedAdmins = adminPersons
        .filter((a) => (a.managerId ?? null) === (person.managerId ?? null))
        .filter((a) => safeParseIdArray(a.region).includes(person.id));

      return {
        title: "Executive Hierarchy",
        nodes: [
          { label: "GM", value: gm ? `${gm.firstName} ${gm.lastName}` : "—", kind: "gm" },
          {
            label: "Manager / Supervisor",
            value: manager ? `${manager.firstName} ${manager.lastName}` : "—",
            kind: "manager",
          },
          { label: "Executive", value: `${person.firstName} ${person.lastName}`, kind: "executive" },
          {
            label: "Linked Admin(s)",
            value:
              linkedAdmins.length === 0
                ? "—"
                : `${linkedAdmins[0].firstName} ${linkedAdmins[0].lastName}${
                    linkedAdmins.length > 1 ? ` (+${linkedAdmins.length - 1} more)` : ""
                  }`,
            kind: "admin",
            meta: { adminEmails: linkedAdmins.map((a) => a.email) },
          },
        ],
        linkedExecutivesList: [person],
      };
    }

    if (person.type === "manager" || person.type === "supervisor") {
      const gm = person.gmId ? personById.get(person.gmId) ?? null : null;
      const execsUnder = executivePersons.filter((e) => e.managerId === person.id);

      const adminEmails = new Set<string>();
      for (const ex of execsUnder) {
        const linkedAdmins = adminPersons
          .filter((a) => (a.managerId ?? null) === (ex.managerId ?? null))
          .filter((a) => safeParseIdArray(a.region).includes(ex.id));
        for (const a of linkedAdmins) adminEmails.add(a.email);
      }

      return {
        title: person.type === "manager" ? "Manager Hierarchy" : "Supervisor Hierarchy",
        nodes: [
          { label: "GM", value: gm ? `${gm.firstName} ${gm.lastName}` : "—", kind: "gm" },
          {
            label: person.type === "manager" ? "Manager" : "Supervisor",
            value: `${person.firstName} ${person.lastName}`,
            kind: "manager",
          },
          {
            label: "Executives under this manager",
            value: execsUnder.length === 0 ? "—" : `${execsUnder.length} executive(s)`,
            kind: "executive",
          },
          {
            label: "Admins linked to those executives",
            value: adminEmails.size === 0 ? "—" : `${adminEmails.size} admin(s)`,
            kind: "admin",
            meta: { adminEmails: Array.from(adminEmails) },
          },
        ],
        linkedExecutivesList: execsUnder.slice(0, 10),
      };
    }

    if (person.type === "gm") {
      const managersUnder = [...managerPersons, ...supervisorPersons].filter((m) => m.gmId === person.id);
      const execsUnder = executivePersons.filter((e) => e.managerId != null && managersUnder.some((m) => m.id === e.managerId));

      const adminEmails = new Set<string>();
      for (const ex of execsUnder) {
        const linkedAdmins = adminPersons
          .filter((a) => (a.managerId ?? null) === (ex.managerId ?? null))
          .filter((a) => safeParseIdArray(a.region).includes(ex.id));
        for (const a of linkedAdmins) adminEmails.add(a.email);
      }

      return {
        title: "GM Hierarchy",
        nodes: [
          { label: "GM", value: `${person.firstName} ${person.lastName}`, kind: "gm" },
          {
            label: "Managers / Supervisors under this GM",
            value: managersUnder.length === 0 ? "—" : `${managersUnder.length} record(s)`,
            kind: "manager",
          },
          {
            label: "Executives under this GM",
            value: execsUnder.length === 0 ? "—" : `${execsUnder.length} executive(s)`,
            kind: "executive",
          },
          {
            label: "Admins linked to those executives",
            value: adminEmails.size === 0 ? "—" : `${adminEmails.size} admin(s)`,
            kind: "admin",
            meta: { adminEmails: Array.from(adminEmails) },
          },
        ],
        linkedExecutivesList: execsUnder.slice(0, 10),
      };
    }

    if (person.type === "admin") {
      const manager = person.managerId ? personById.get(person.managerId) ?? null : null;
      const gm = manager?.gmId ? personById.get(manager.gmId) ?? null : null;
      const linkedExecIds = safeParseIdArray(person.region);
      const linkedExecutives = executivePersons.filter((e) => linkedExecIds.includes(e.id));

      return {
        title: "Admin Hierarchy",
        nodes: [
          { label: "Admin", value: `${person.firstName} ${person.lastName}`, kind: "admin" },
          { label: "Manager / Supervisor", value: manager ? `${manager.firstName} ${manager.lastName}` : "—", kind: "manager" },
          { label: "GM", value: gm ? `${gm.firstName} ${gm.lastName}` : "—", kind: "gm" },
          {
            label: "Linked executives (by region)",
            value: linkedExecutives.length === 0 ? "—" : `${linkedExecutives.length} executive(s)`,
            kind: "executive",
          },
        ],
        linkedExecutivesList: linkedExecutives.slice(0, 10),
      };
    }

    return {
      title: "User Hierarchy",
      nodes: [{ label: "No hierarchy mapping", value: "—", kind: "unknown" }],
      linkedExecutivesList: [],
    };
  }, [person, personById, adminPersons, executivePersons, gmPersons, managerPersons, supervisorPersons]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4">
        <CardHeader className="flex flex-row items-start justify-between p-6 border-b border-slate-200">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="h-5 w-5 text-mtc-blue" />
              {hierarchy?.title ?? "User Hierarchy"}
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">Role: {user.role}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading hierarchy...
            </div>
          )}

          {!loading && (
            <>
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-mtc-blue" /> User Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3 md:grid-cols-3 text-sm">
                    <div>
                      <span className="text-slate-500 block">Name</span>
                      <span className="font-medium">{user.firstName} {user.lastName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Email</span>
                      <span className="font-medium">{user.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Phone</span>
                      <span className="font-medium">{user.phone ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">User ID</span>
                      <span className="font-mono">{user.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Portal Created</span>
                      <span className="font-medium">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Resolved Person Type</span>
                      <span className="font-medium">
                        {person?.type ? (
                          <Badge variant="default" className="ml-1">{person.type}</Badge>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-mtc-blue" /> Linking / Hierarchy
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {hierarchy ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Level</TableHead>
                            <TableHead>Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hierarchy.nodes.map((n, idx) => (
                            <TableRow key={`${n.label}-${idx}`}>
                              <TableCell className="font-medium">{n.label}</TableCell>
                              <TableCell className="text-slate-700">{n.value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {hierarchy.linkedExecutivesList && hierarchy.linkedExecutivesList.length > 0 && (
                        <div className="mt-6">
                          <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                            <Shield className="h-4 w-4 text-slate-500" /> Sample linked executives
                          </p>
                          <div className="mt-2 grid sm:grid-cols-2 gap-3">
                            {hierarchy.linkedExecutivesList.map((ex) => (
                              <div key={ex.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                                <div className="font-semibold text-slate-900">{ex.firstName} {ex.lastName}</div>
                                <div className="text-slate-500 text-xs mt-1">{ex.email}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-slate-500">No hierarchy info found for this user.</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </CardContent>
      </div>
    </div>
  );
}

