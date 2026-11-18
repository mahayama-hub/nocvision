import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  canAssignRole,
  hashPassword,
  loadRbacStore,
  NocAccountRecord,
  NocRoleName,
  PermissionKey,
  requireSessionUser,
  saveRbacStore,
  stripSensitiveUserFields,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = requireSessionUser(req);
  if (auth.response) return auth.response;

  const store = loadRbacStore();
  return NextResponse.json({
    roles: store.roles,
    users: store.users.map(stripSensitiveUserFields),
  });
}

export async function POST(req: NextRequest) {
  const auth = requireSessionUser(req, "manage_users");
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const action = body.action as string;
    const store = loadRbacStore();

    if (action === "add_user") {
      const fullName = ((body.fullName as string) || "").trim() || "Anggota Baru";
      const email =
        ((body.email as string) || "").trim() ||
        `${fullName.toLowerCase().replace(/[^a-z0-9]/g, "")}@nocvision.id`;
      const username =
        ((body.username as string) || "").trim().toLowerCase() ||
        email.split("@")[0];

      if (
        store.users.some(
          (u) =>
            u.username.toLowerCase() === username ||
            u.email.toLowerCase() === email.toLowerCase()
        )
      ) {
        return NextResponse.json(
          { error: `Anggota dengan username/email tersebut sudah terdaftar.` },
          { status: 400 }
        );
      }

      const role =
        (body.role as NocRoleName) || ("NOC Engineer" as NocRoleName);
      const roleDef = store.roles.find((r) => r.role === role);
      if (!roleDef) {
        return NextResponse.json(
          { error: `Role '${role}' tidak dikenali.` },
          { status: 400 }
        );
      }

      if (!canAssignRole(auth.user.role, role)) {
        return NextResponse.json(
          {
            error: `Akses ditolak: Role '${auth.user.role}' tidak dapat membuat user dengan role '${role}'. Hanya role di bawahnya (NOC Engineer, NOC Read-Only / Auditor, Refresh) yang diizinkan.`,
          },
          { status: 403 }
        );
      }
      const initials = fullName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const suppliedPassword =
        typeof body.password === "string" ? body.password.trim() : "";
      if (suppliedPassword.length > 0 && suppliedPassword.length < 8) {
        return NextResponse.json(
          { error: "Password minimal harus 8 karakter." },
          { status: 400 }
        );
      }
      const rawPassword =
        suppliedPassword.length >= 8
          ? suppliedPassword
          : crypto.randomBytes(12).toString("base64url");
      const newUser: NocAccountRecord = {
        id: `usr-${Date.now().toString().slice(-5)}`,
        username,
        email,
        phone: ((body.phone as string) || "").trim(),
        passwordHash: hashPassword(rawPassword),
        fullName,
        role,
        shift: ((body.shift as string) || "").trim() || "Workspace Member",
        status: "active",
        permissions: roleDef.permissions,
        avatarInitials: initials || "NC",
        lastLogin: "Baru ditambahkan",
      };

      store.users.push(newUser);
      saveRbacStore(store);

      return NextResponse.json({
        ok: true,
        roles: store.roles,
        users: store.users.map(stripSensitiveUserFields),
      });
    }

    if (action === "update_user") {
      const userId = body.userId as string;
      const target = store.users.find((u) => u.id === userId);
      if (!target) {
        return NextResponse.json(
          { error: "Anggota tidak ditemukan" },
          { status: 404 }
        );
      }

      if (
        auth.user.role !== "Administrator" &&
        (target.role === "Administrator" ||
          (target.role === "Tenant Owner" && target.id !== auth.user.id))
      ) {
        return NextResponse.json(
          {
            error: `Akses ditolak: Role '${auth.user.role}' tidak dapat mengubah akun '${target.role}'.`,
          },
          { status: 403 }
        );
      }

      if (body.role) {
        const nextRole = body.role as NocRoleName;
        if (nextRole !== target.role && !canAssignRole(auth.user.role, nextRole)) {
          return NextResponse.json(
            {
              error: `Akses ditolak: Role '${auth.user.role}' tidak dapat menetapkan role '${nextRole}'. Hanya role di bawahnya (NOC Engineer, NOC Read-Only / Auditor, Refresh) yang diizinkan.`,
            },
            { status: 403 }
          );
        }
        target.role = nextRole;
        const rDef = store.roles.find((r) => r.role === target.role);
        if (rDef) target.permissions = rDef.permissions;
      }
      if (typeof body.phone === "string") {
        target.phone = body.phone.trim();
      }
      if (body.fullName) {
        target.fullName = String(body.fullName).trim();
      }
      if (body.email) {
        target.email = String(body.email).trim();
      }
      if (body.status) {
        target.status = body.status as "active" | "suspended";
      }
      if (body.shift) {
        target.shift = body.shift as string;
      }
      if (typeof body.password === "string" && body.password.trim().length > 0) {
        const nextPw = body.password.trim();
        if (nextPw.length < 8) {
          return NextResponse.json(
            { error: "Password minimal harus 8 karakter." },
            { status: 400 }
          );
        }
        target.passwordHash = hashPassword(nextPw);
        delete target.passwordPlain;
      }

      saveRbacStore(store);
      return NextResponse.json({
        ok: true,
        roles: store.roles,
        users: store.users.map(stripSensitiveUserFields),
      });
    }

    if (action === "delete_user") {
      const userId = body.userId as string;
      const target = store.users.find((u) => u.id === userId);
      if (target?.id === auth.user.id) {
        return NextResponse.json(
          { error: "Anda tidak dapat menghapus akun yang sedang login." },
          { status: 400 }
        );
      }
      if (target?.id === "usr-00" || target?.username === "superadmin") {
        return NextResponse.json(
          {
            error: "Akun Super Administrator utama (superadmin) tidak dapat dihapus.",
          },
          { status: 400 }
        );
      }
      if (
        auth.user.role !== "Administrator" &&
        (target?.id === "usr-01" ||
          target?.username === "admin" ||
          target?.role === "Administrator" ||
          target?.role === "Tenant Owner")
      ) {
        return NextResponse.json(
          {
            error: `Akses ditolak: Role '${auth.user.role}' tidak dapat menghapus akun '${target?.role || "Tenant Owner"}'.`,
          },
          { status: 403 }
        );
      }
      store.users = store.users.filter((u) => u.id !== userId);
      saveRbacStore(store);
      return NextResponse.json({
        ok: true,
        roles: store.roles,
        users: store.users.map(stripSensitiveUserFields),
      });
    }

    if (action === "toggle_role_permission") {
      const roleName = body.role as NocRoleName;
      const perm = body.permission as PermissionKey;
      if (
        auth.user.role !== "Administrator" &&
        (roleName === "Administrator" || roleName === "Tenant Owner")
      ) {
        return NextResponse.json(
          {
            error: `Akses ditolak: Role '${auth.user.role}' tidak dapat mengubah izin role '${roleName}'.`,
          },
          { status: 403 }
        );
      }
      const roleObj = store.roles.find((r) => r.role === roleName);
      if (!roleObj) {
        return NextResponse.json(
          { error: "Role tidak ditemukan" },
          { status: 404 }
        );
      }

      if (roleObj.permissions.includes(perm)) {
        roleObj.permissions = roleObj.permissions.filter((p) => p !== perm);
      } else {
        roleObj.permissions.push(perm);
      }

      store.users.forEach((u) => {
        if (u.role === roleName) {
          u.permissions = [...roleObj.permissions];
        }
      });

      saveRbacStore(store);
      return NextResponse.json({
        ok: true,
        roles: store.roles,
        users: store.users.map(stripSensitiveUserFields),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
