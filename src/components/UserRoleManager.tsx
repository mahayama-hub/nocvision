"use client";

import React, { useEffect, useState } from "react";
import {
  NocRoleName,
  NocUser,
  PermissionKey,
  RoleDefinition,
} from "@/lib/auth";
import { getAssignableRoles } from "@/lib/rbac-rules";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  Pencil,
  RotateCw,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";

import type { BentoTheme } from "./BentoOverviewDashboard";

interface UserRoleManagerProps {
  theme?: BentoTheme;
  currentUser: NocUser;
  onNotify: (msg: string) => void;
}

const PERMISSION_CATALOG: {
  key: PermissionKey;
  label: string;
}[] = [
  { key: "view_dashboard", label: "Dashboard & Topologi" },
  { key: "view_graphs", label: "Grafik & Telemetri Alat" },
  { key: "manage_devices", label: "Konfigurasi & Kelola Perangkat" },
  { key: "olt_provision", label: "Provisioning & Reset ONU OLT" },
  { key: "run_diagnostics", label: "Web Terminal & Diagnostics" },
  { key: "manage_incidents", label: "Troubleshoot & Resolve Incident" },
  { key: "refresh_sync", label: "Eksekusi Refresh / Sinkronisasi" },
  { key: "manage_users", label: "Billing & User Management" },
];

export default function UserRoleManager({
  theme = "dark",
  currentUser,
  onNotify,
}: UserRoleManagerProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const cardSurface = isLightCard
    ? "bento-card-light"
    : "bento-card-dark";
  const headingTxt = isLightCard ? "text-slate-900" : "text-white";
  const mutedTxt = isLightCard ? "text-slate-500" : "text-slate-400";
  const canManageUsers = currentUser.permissions.includes("manage_users");
  const isSuperAdmin = currentUser.role === "Administrator";
  const assignableRoles = getAssignableRoles(currentUser.role);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [users, setUsers] = useState<NocUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedRoleForMatrix, setSelectedRoleForMatrix] =
    useState<NocRoleName | null>(null);

  // Inline Phone Editing State
  const [editingPhoneUserId, setEditingPhoneUserId] = useState<string | null>(
    null
  );
  const [phoneInput, setPhoneInput] = useState<string>("");

  // Pagination State
  const [perPage, setPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Add Member Form State
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("noc12345");
  const [newRole, setNewRole] = useState<NocRoleName>("NOC Engineer");

  // Edit Member Modal State
  const [editingUser, setEditingUser] = useState<NocUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<NocRoleName>("NOC Engineer");
  const [editShift, setEditShift] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "suspended">("active");
  const [editPassword, setEditPassword] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchRbac = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.roles) setRoles(data.roles);
      if (data.users) setUsers(data.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRbac();
  }, []);

  const renderRoleIcon = (iconName: RoleDefinition["iconName"]) => {
    const cls = isLightCard
      ? "w-4 h-4 text-sky-600 shrink-0"
      : "w-4 h-4 text-cyan-400 shrink-0";
    switch (iconName) {
      case "crown":
        return <Crown className={cls} />;
      case "shield":
        return <Shield className={cls} />;
      case "wrench":
        return <Wrench className={cls} />;
      case "eye":
        return <Eye className={cls} />;
      case "refresh":
        return <RotateCw className={cls} />;
      default:
        return <Shield className={cls} />;
    }
  };

  const handleSavePhone = async (userId: string) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_user",
        userId,
        phone: phoneInput,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      onNotify(data.error || "Gagal menyimpan nomor telepon.");
      return;
    }
    if (data.ok) {
      setUsers(data.users);
      setEditingPhoneUserId(null);
      onNotify("No. WhatsApp / Telp berhasil disimpan.");
    }
  };

  const handleRoleChange = async (userId: string, newRoleVal: NocRoleName) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_user",
        userId,
        role: newRoleVal,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      onNotify(data.error || "Gagal mengubah role anggota.");
      return;
    }
    if (data.ok) {
      setRoles(data.roles);
      setUsers(data.users);
      onNotify(`Role anggota berhasil diubah menjadi ${newRoleVal}.`);
    }
  };

  const handleDeleteUser = async (userId: string, fullName: string) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_user", userId }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      onNotify(data.error || "Gagal menghapus anggota");
      return;
    }
    setUsers(data.users);
    onNotify(`Anggota '${fullName}' telah dihapus dari workspace.`);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_user",
        fullName: newFullName,
        email: newEmail,
        phone: newPhone,
        username:
          newUsername ||
          newEmail.split("@")[0] ||
          newFullName.toLowerCase().replace(/\s+/g, ""),
        password: newPassword,
        role: newRole,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      onNotify(data.error || "Gagal menambahkan anggota");
      return;
    }
    setRoles(data.roles);
    setUsers(data.users);
    setShowAddModal(false);
    setNewFullName("");
    setNewEmail("");
    setNewPhone("");
    setNewUsername("");
    onNotify(`Anggota '${newFullName}' (${newRole}) berhasil ditambahkan!`);
  };

  const handleOpenEditModal = (u: NocUser) => {
    setEditingUser(u);
    setEditFullName(u.fullName || "");
    setEditEmail(u.email || "");
    setEditPhone(u.phone || "");
    setEditRole(u.role);
    setEditShift(u.shift || "");
    setEditStatus(u.status || "active");
    setEditPassword("");
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {
        action: "update_user",
        userId: editingUser.id,
        fullName: editFullName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        role: editRole,
        shift: editShift.trim(),
        status: editStatus,
      };
      if (editPassword.trim().length > 0) {
        payload.password = editPassword.trim();
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        onNotify(data.error || "Gagal memperbarui profil pengguna.");
        return;
      }
      setRoles(data.roles);
      setUsers(data.users);
      setEditingUser(null);
      onNotify(`Profil '${editFullName}' berhasil diperbarui!`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTogglePermission = async (
    role: NocRoleName,
    permission: PermissionKey
  ) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_role_permission",
        role,
        permission,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      onNotify(data.error || "Gagal memperbarui hak akses role.");
      return;
    }
    if (data.ok) {
      setRoles(data.roles);
      setUsers(data.users);
      onNotify(`Hak akses '${permission}' pada role ${role} diperbarui.`);
    }
  };

  if (loading) {
    return (
      <div className={`${cardSurface} ${mutedTxt} rounded-[24px] p-10 text-center text-sm shadow`}>
        Memuat data Users &amp; Roles workspace...
      </div>
    );
  }

  const totalResults = users.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / perPage));
  const startIdx = (currentPage - 1) * perPage;
  const paginatedUsers = users.slice(startIdx, startIdx + perPage);

  return (
    <div className="space-y-6">
      {/* ================= HEADER: USERS & ROLES + TAMBAH ANGGOTA BUTTON ================= */}
      <div className={`${cardSurface} rounded-[26px] p-5 sm:px-6 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className={`text-xl sm:text-2xl font-bold ${headingTxt} tracking-tight`}>
            Users &amp; Roles
          </h2>
          <p className={`text-xs sm:text-sm ${mutedTxt} mt-0.5`}>
            Anggota workspace Anda. Administrator hanya bisa dikelola Super Admin.
          </p>
        </div>

        {canManageUsers && assignableRoles.length > 0 && (
          <button
            onClick={() => {
              if (!assignableRoles.includes(newRole)) {
                setNewRole(assignableRoles[0]);
              }
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-sky-500/20 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Anggota</span>
          </button>
        )}
      </div>

      {/* ================= 5 ROLE CARDS GRID (4 TOP + 1 SECOND ROW) ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {roles.map((r) => {
          const memberCount = users.filter((u) => u.role === r.role).length;
          const isSelected = selectedRoleForMatrix === r.role;
          return (
            <div
              key={r.role}
              onClick={() =>
                setSelectedRoleForMatrix(isSelected ? null : r.role)
              }
              title="Klik untuk melihat/mengatur detail izin modul role ini"
              className={`${cardSurface} rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between min-h-[152px] ${
                isSelected
                  ? isLightCard
                    ? "border-sky-500 ring-2 ring-sky-500/25 shadow-md"
                    : "border-cyan-400 ring-2 ring-cyan-400/25 shadow-md"
                  : isLightCard
                  ? "hover:border-slate-300"
                  : "hover:border-sky-400/50"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {renderRoleIcon(r.iconName)}
                    <h3 className={`text-sm font-bold ${headingTxt}`}>
                      {r.role}
                    </h3>
                  </div>
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 hover:text-cyan-400" />
                </div>
                <p className={`text-xs ${mutedTxt} mt-2.5 leading-relaxed`}>
                  {r.description}
                </p>
              </div>

              <div className={`mt-4 pt-2 flex items-center justify-between text-xs ${mutedTxt} font-medium`}>
                <span>{memberCount} anggota</span>
                {isSelected && (
                  <span className={`text-[11px] font-semibold ${isLightCard ? "text-sky-600" : "text-cyan-300"}`}>
                    Atur Izin &darr;
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Expandable Permission Drawer when a Role Card is clicked */}
      {selectedRoleForMatrix && (
        <div
          className={`${cardSurface} rounded-2xl p-5 border ${
            isLightCard ? "border-sky-200" : "border-cyan-400/40"
          } space-y-3`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`text-sm font-bold ${headingTxt}`}>
                Konfigurasi Hak Akses Role:{" "}
                <span className={isLightCard ? "text-sky-600" : "text-cyan-300"}>{selectedRoleForMatrix}</span>
              </h4>
              <p className={`text-xs ${mutedTxt}`}>
                Klik modul di bawah untuk mengaktifkan atau menonaktifkan izin pada role ini.
              </p>
            </div>
            <button
              onClick={() => setSelectedRoleForMatrix(null)}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Tutup ✕
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {PERMISSION_CATALOG.map((perm) => {
              const roleObj = roles.find(
                (r) => r.role === selectedRoleForMatrix
              );
              const enabled = roleObj?.permissions.includes(perm.key) ?? false;
              const isLockedRoleMatrix =
                !canManageUsers ||
                (!isSuperAdmin &&
                  (selectedRoleForMatrix === "Administrator" ||
                    selectedRoleForMatrix === "Tenant Owner"));
              return (
                <button
                  key={perm.key}
                  type="button"
                  disabled={isLockedRoleMatrix}
                  onClick={() =>
                    handleTogglePermission(selectedRoleForMatrix, perm.key)
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
                    isLockedRoleMatrix ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                  } ${
                    enabled
                      ? isLightCard
                        ? "bg-sky-50 text-sky-700 border-sky-300 font-semibold"
                        : "bg-cyan-500/20 text-cyan-300 border-cyan-400/50 font-semibold"
                      : isLightCard
                      ? "bg-slate-50 text-slate-400 border-slate-200"
                      : "bg-[#051122] text-slate-400 border-slate-700"
                  }`}
                >
                  <span>{enabled ? "✓" : "+"}</span>
                  <span>{perm.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= ANGGOTA TABLE CARD MATCHING REFERENCE IMAGE ================= */}
      <div className={`${cardSurface} rounded-2xl border overflow-hidden`}>
        <div className="p-6 pb-4">
          <h3 className={`text-base font-bold ${headingTxt}`}>Anggota</h3>
          <p className={`text-xs ${mutedTxt} mt-0.5`}>
            Kelola anggota workspace dan tentukan role hak aksesnya. Administrator hanya dikelola Super Admin.
          </p>
        </div>

        <div className="overflow-x-auto px-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b text-[11px] font-semibold uppercase tracking-wider ${mutedTxt} ${
                  isLightCard ? "border-slate-200" : "border-sky-500/20"
                }`}
              >
                <th className="py-3 pr-4">NAMA</th>
                <th className="py-3 px-4">EMAIL</th>
                <th className="py-3 px-4">NO. WHATSAPP / TELP</th>
                <th className="py-3 px-4">ROLE</th>
                <th className="py-3 pl-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y text-xs sm:text-sm ${
                isLightCard ? "divide-slate-100" : "divide-sky-500/15"
              }`}
            >
              {paginatedUsers.map((u, idx) => {
                const isSelf =
                  u.id === currentUser.id ||
                  u.username === currentUser.username ||
                  idx === 0;
                const isEditingPhone = editingPhoneUserId === u.id;

                return (
                  <tr
                    key={u.id}
                    className={`transition-colors ${
                      isLightCard ? "hover:bg-slate-50/80" : "hover:bg-sky-950/30"
                    }`}
                  >
                    {/* NAMA + Badge "Anda" */}
                    <td className={`py-4 pr-4 font-semibold ${headingTxt} whitespace-nowrap`}>
                      <div className="flex items-center gap-2">
                        <span>{u.fullName}</span>
                        {isSelf && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                              isLightCard
                                ? "bg-slate-100 text-slate-600 border-slate-200"
                                : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                            }`}
                          >
                            Anda
                          </span>
                        )}
                      </div>
                    </td>

                    {/* EMAIL */}
                    <td
                      className={`py-4 px-4 whitespace-nowrap ${
                        isLightCard ? "text-slate-600" : "text-slate-300"
                      }`}
                    >
                      {u.email}
                    </td>

                    {/* NO. WHATSAPP / TELP with Inline Edit Pencil */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {isEditingPhone ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="+62 812-xxxx-xxxx"
                            className={`border border-cyan-400 rounded-lg px-2.5 py-1 text-xs focus:outline-none w-40 ${
                              isLightCard
                                ? "bg-white text-slate-800"
                                : "bg-[#051122] text-white"
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => handleSavePhone(u.id)}
                            className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                            title="Simpan"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingPhoneUserId(null)}
                            className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                            title="Batal"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          {u.phone && u.phone.trim().length > 0 ? (
                            <span
                              className={`font-medium ${
                                isLightCard ? "text-slate-700" : "text-slate-200"
                              }`}
                            >
                              {u.phone}
                            </span>
                          ) : (
                            <span className="italic text-slate-400 text-xs">
                              Belum diisi
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPhoneUserId(u.id);
                              setPhoneInput(u.phone || "");
                            }}
                            className="text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                            title="Ubah No. WhatsApp / Telp"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* ROLE DROPDOWN */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {(() => {
                        const isProtectedAccount =
                          !isSuperAdmin &&
                          (u.role === "Administrator" || u.role === "Tenant Owner");
                        const dropdownDisabled =
                          !canManageUsers || isProtectedAccount;
                        const rowOptions = Array.from(
                          new Set<NocRoleName>([u.role, ...assignableRoles])
                        );
                        return (
                          <select
                            value={u.role}
                            disabled={dropdownDisabled}
                            onChange={(e) =>
                              handleRoleChange(u.id, e.target.value as NocRoleName)
                            }
                            title={
                              isProtectedAccount
                                ? `Role '${u.role}' hanya dapat dikelola oleh Administrator.`
                                : undefined
                            }
                            className={`border rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium focus:outline-none focus:border-cyan-400 min-w-[200px] transition ${
                              dropdownDisabled
                                ? "opacity-75 cursor-not-allowed"
                                : "cursor-pointer"
                            } ${
                              isLightCard
                                ? "bg-slate-50/70 hover:bg-white border-slate-200 text-slate-700"
                                : "bg-[#051122] hover:bg-[#081a33] border-sky-500/25 text-slate-100"
                            }`}
                          >
                            {rowOptions.map((roleOpt) => (
                              <option key={roleOpt} value={roleOpt}>
                                {roleOpt}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </td>

                    {/* AKSI */}
                    <td className="py-4 pl-4 text-right whitespace-nowrap">
                      {(() => {
                        const canEditThisUser =
                          isSuperAdmin ||
                          isSelf ||
                          (canManageUsers &&
                            u.role !== "Administrator" &&
                            u.role !== "Tenant Owner");
                        const canDeleteThisUser =
                          !isSelf &&
                          u.id !== "usr-00" &&
                          u.username !== "superadmin" &&
                          canManageUsers &&
                          (isSuperAdmin ||
                            (u.role !== "Administrator" &&
                              u.role !== "Tenant Owner" &&
                              u.id !== "usr-01" &&
                              u.username !== "admin"));

                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            {canEditThisUser && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(u)}
                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                                  isLightCard
                                    ? "bg-slate-50 hover:bg-white border-slate-200 text-slate-700 hover:text-sky-600 hover:border-sky-300 shadow-xs"
                                    : "bg-[#06152a] hover:bg-[#0a2040] border-sky-500/25 text-slate-200 hover:text-cyan-300 hover:border-cyan-400/50 shadow-xs"
                                }`}
                                title={`Edit data & kredensial ${u.fullName}`}
                              >
                                <Pencil className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Edit</span>
                              </button>
                            )}

                            {canDeleteThisUser ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id, u.fullName)}
                                className="px-2 py-1.5 rounded-lg border border-transparent hover:border-rose-500/30 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer flex items-center gap-1"
                                title={`Hapus anggota ${u.fullName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="text-xs font-semibold">Hapus</span>
                              </button>
                            ) : !canEditThisUser ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ================= BOTTOM PAGINATION BAR MATCHING REFERENCE IMAGE ================= */}
        <div
          className={`px-6 py-4 mt-2 border-t flex flex-wrap items-center justify-between gap-4 text-xs ${mutedTxt} ${
            isLightCard ? "border-slate-100" : "border-sky-500/15"
          }`}
        >
          <div>
            Menampilkan{" "}
            <strong className={headingTxt}>
              {totalResults > 0 ? startIdx + 1 : 0}
            </strong>{" "}
            sampai{" "}
            <strong className={headingTxt}>
              {Math.min(startIdx + perPage, totalResults)}
            </strong>{" "}
            dari <strong className={headingTxt}>{totalResults}</strong> hasil
          </div>

          <div
            className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 ${
              isLightCard
                ? "bg-white border-slate-200"
                : "bg-[#051122] border-sky-500/25"
            }`}
          >
            <span className={mutedTxt}>per halaman</span>
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className={`bg-transparent font-semibold ${headingTxt} focus:outline-none cursor-pointer`}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition cursor-pointer ${
                  currentPage === page
                    ? isLightCard
                      ? "bg-sky-50 text-sky-700 border border-sky-300"
                      : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/50"
                    : `${mutedTxt} hover:bg-slate-500/10`
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= MODAL TAMBAH ANGGOTA WORKSPACE ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-[26px] max-w-md w-full p-6 shadow-2xl ${
              isLightCard
                ? "bg-white border-slate-200 text-slate-900"
                : "bg-[#071830] border-sky-500/35 text-slate-100"
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isLightCard ? "border-slate-100" : "border-sky-500/20"
              }`}
            >
              <h3 className={`text-base font-bold flex items-center gap-2 ${headingTxt}`}>
                <UserPlus className={`w-4 h-4 ${isLightCard ? "text-sky-600" : "text-cyan-400"}`} />
                Tambah Anggota Workspace
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className={`text-sm cursor-pointer ${
                  isLightCard ? "text-slate-400 hover:text-slate-700" : "text-slate-400 hover:text-white"
                }`}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleAddMember}
              className="space-y-3.5 mt-4 text-xs sm:text-sm"
            >
              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                  required
                />
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="budi@gmail.com"
                  className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                  required
                />
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  No. WhatsApp / Telp
                </label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+62 812-3456-7890 (Opsional)"
                  className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Username Login
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="budi"
                    className={`w-full border rounded-xl px-3.5 py-2 font-mono focus:outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  />
                </div>
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Password Login
                  </label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`w-full border rounded-xl px-3.5 py-2 font-mono focus:outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Role Hak Akses
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as NocRoleName)}
                  className={`w-full border rounded-xl px-3.5 py-2 font-medium focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                >
                  {assignableRoles.map((roleOpt) => (
                    <option key={roleOpt} value={roleOpt}>
                      {roleOpt}
                    </option>
                  ))}
                </select>
                {!isSuperAdmin && (
                  <p className={`text-[11px] mt-1 ${mutedTxt}`}>
                    Tenant Owner hanya dapat membuat user dengan role di bawahnya (NOC Engineer, NOC Read-Only / Auditor, Refresh).
                  </p>
                )}
              </div>

              <div
                className={`flex items-center justify-end gap-2 pt-3 border-t ${
                  isLightCard ? "border-slate-100" : "border-sky-500/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2 rounded-xl font-medium cursor-pointer transition ${
                    isLightCard
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "bg-white/10 text-slate-300 hover:bg-white/15"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-semibold shadow-sm cursor-pointer"
                >
                  Tambah Anggota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL EDIT PENGGUNA (SUPERADMIN & SELF-MANAGEMENT) ================= */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-[26px] max-w-lg w-full p-6 shadow-2xl ${
              isLightCard
                ? "bg-white border-slate-200 text-slate-900"
                : "bg-[#071830] border-sky-500/35 text-slate-100"
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isLightCard ? "border-slate-100" : "border-sky-500/20"
              }`}
            >
              <div>
                <h3 className={`text-base font-bold flex items-center gap-2 ${headingTxt}`}>
                  <Pencil className={`w-4 h-4 ${isLightCard ? "text-sky-600" : "text-cyan-400"}`} />
                  Edit Pengguna: {editingUser.fullName}
                </h3>
                <p className={`text-xs ${mutedTxt} mt-0.5`}>
                  Username: <span className="font-mono font-semibold">{editingUser.username}</span> • ID: {editingUser.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className={`text-sm cursor-pointer ${
                  isLightCard ? "text-slate-400 hover:text-slate-700" : "text-slate-400 hover:text-white"
                }`}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSaveEditUser}
              className="space-y-3.5 mt-4 text-xs sm:text-sm"
            >
              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    No. WhatsApp / Telp
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+62 812-xxxx-xxxx"
                    className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Role Hak Akses
                  </label>
                  <select
                    value={editRole}
                    disabled={!isSuperAdmin && (editingUser.role === "Administrator" || editingUser.role === "Tenant Owner")}
                    onChange={(e) => setEditRole(e.target.value as NocRoleName)}
                    className={`w-full border rounded-xl px-3.5 py-2 font-medium focus:outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  >
                    {Array.from(new Set<NocRoleName>([editingUser.role, ...assignableRoles])).map((roleOpt) => (
                      <option key={roleOpt} value={roleOpt}>
                        {roleOpt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Status Akun
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "active" | "suspended")}
                    className={`w-full border rounded-xl px-3.5 py-2 font-medium focus:outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  >
                    <option value="active">Active (Aktif)</option>
                    <option value="suspended">Suspended (Ditangguhkan)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Shift / Penugasan
                </label>
                <input
                  type="text"
                  value={editShift}
                  onChange={(e) => setEditShift(e.target.value)}
                  placeholder="Contoh: Shift Pagi (Core & OLT)"
                  className={`w-full border rounded-xl px-3.5 py-2 focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                />
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Password Baru (Opsional)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  className={`w-full border rounded-xl px-3.5 py-2 font-mono focus:outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                />
                <p className={`text-[11px] mt-1 ${mutedTxt}`}>
                  Jika diisi, password akun pengguna ini akan langsung di-reset dan di-hash aman dengan scrypt.
                </p>
              </div>

              <div
                className={`flex items-center justify-end gap-2 pt-3 border-t ${
                  isLightCard ? "border-slate-100" : "border-sky-500/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className={`px-4 py-2 rounded-xl font-medium cursor-pointer transition ${
                    isLightCard
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "bg-white/10 text-slate-300 hover:bg-white/15"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-semibold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
