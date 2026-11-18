import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { NextRequest, NextResponse } from "next/server";
import { NocRoleName } from "./rbac-rules";

export type { NocRoleName };
export {
  ALL_NOC_ROLES,
  SUBORDINATE_NOC_ROLES,
  getAssignableRoles,
  canAssignRole,
} from "./rbac-rules";

export const SESSION_COOKIE_NAME = "omninoc_session";

export type PermissionKey =
  | "view_dashboard"
  | "view_graphs"
  | "manage_devices"
  | "olt_provision"
  | "run_diagnostics"
  | "manage_incidents"
  | "manage_users"
  | "refresh_sync";

export interface RoleDefinition {
  role: NocRoleName;
  description: string;
  iconName: "crown" | "shield" | "wrench" | "eye" | "refresh";
  badgeClass: string;
  permissions: PermissionKey[];
}

export interface NocUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone?: string; // No. WhatsApp / Telp
  role: NocRoleName;
  shift: string;
  status: "active" | "suspended";
  permissions: PermissionKey[];
  avatarInitials: string;
  lastLogin?: string;
}

export interface NocAccountRecord extends NocUser {
  passwordHash?: string;
  /** Legacy field supported only for transparent migration into passwordHash */
  passwordPlain?: string;
}

export interface RbacStore {
  version?: number;
  roles: RoleDefinition[];
  users: NocAccountRecord[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const RBAC_FILE = path.join(DATA_DIR, "noc-users.json");
const CURRENT_RBAC_VERSION = 3;

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: "Administrator",
    description: "Kelola user, langganan, pembayaran, dan perangkat.",
    iconName: "crown",
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    permissions: [
      "view_dashboard",
      "view_graphs",
      "manage_devices",
      "olt_provision",
      "run_diagnostics",
      "manage_incidents",
      "manage_users",
      "refresh_sync",
    ],
  },
  {
    role: "Tenant Owner",
    description: "Akses penuh termasuk billing & user management.",
    iconName: "shield",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    permissions: [
      "view_dashboard",
      "view_graphs",
      "manage_devices",
      "olt_provision",
      "run_diagnostics",
      "manage_incidents",
      "manage_users",
      "refresh_sync",
    ],
  },
  {
    role: "NOC Engineer",
    description: "Boleh konfigurasi, commit, dan troubleshoot.",
    iconName: "wrench",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    permissions: [
      "view_dashboard",
      "view_graphs",
      "manage_devices",
      "olt_provision",
      "run_diagnostics",
      "manage_incidents",
      "refresh_sync",
    ],
  },
  {
    role: "NOC Read-Only / Auditor",
    description: "Hanya baca: lihat config, log, dan diagnostics.",
    iconName: "eye",
    badgeClass: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    permissions: ["view_dashboard", "view_graphs", "run_diagnostics"],
  },
  {
    role: "Refresh",
    description:
      "Akses membaca dan mengeksekusi aksi refresh data/sinkronisasi.",
    iconName: "refresh",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    permissions: ["view_dashboard", "view_graphs", "refresh_sync"],
  },
];

export const DEFAULT_NOC_ACCOUNTS: NocAccountRecord[] = [
  {
    id: "usr-00",
    username: "superadmin",
    email: "superadmin@nocvision.id",
    passwordPlain: "superadmin123",
    fullName: "Super Administrator",
    phone: "+62 811-0000-9999",
    role: "Administrator",
    shift: "Tier-4 Global Infrastructure",
    status: "active",
    permissions: DEFAULT_ROLE_DEFINITIONS[0].permissions,
    avatarInitials: "SA",
    lastLogin: "Baru saja",
  },
];

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET wajib dikonfigurasi (minimal 16 karakter, disarankan 32+ karakter acak) pada mode production."
    );
  }
  return "nocvision-dev-session-secret-change-in-production";
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(passwordInput: string, record: NocAccountRecord): boolean {
  if (record.passwordHash && record.passwordHash.startsWith("scrypt$")) {
    const parts = record.passwordHash.split("$");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const derived = crypto.scryptSync(passwordInput, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, "hex");
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  }
  if (typeof record.passwordPlain === "string") {
    const a = Buffer.from(record.passwordPlain, "utf8");
    const b = Buffer.from(passwordInput, "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return false;
}

export function stripSensitiveUserFields(record: NocAccountRecord): NocUser {
  const { passwordHash: _h, passwordPlain: _p, ...safeUser } = record;
  return safeUser;
}

function migrateAccountRecords(users: NocAccountRecord[]): {
  users: NocAccountRecord[];
  changed: boolean;
} {
  let changed = false;
  const migrated = users.map((u) => {
    if (!u.passwordHash && typeof u.passwordPlain === "string") {
      changed = true;
      const { passwordPlain, ...rest } = u;
      return {
        ...rest,
        passwordHash: hashPassword(passwordPlain),
      };
    }
    if ("passwordPlain" in u && u.passwordPlain !== undefined) {
      changed = true;
      const { passwordPlain: _p, ...rest } = u;
      return rest;
    }
    return u;
  });
  return { users: migrated, changed };
}

export function loadRbacStore(): RbacStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(RBAC_FILE)) {
      const { users } = migrateAccountRecords(DEFAULT_NOC_ACCOUNTS);
      const initial: RbacStore = {
        version: CURRENT_RBAC_VERSION,
        roles: DEFAULT_ROLE_DEFINITIONS,
        users,
      };
      fs.writeFileSync(RBAC_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(RBAC_FILE, "utf8");
    const parsed = JSON.parse(raw) as RbacStore;
    let sourceUsers =
      Array.isArray(parsed.users) && parsed.users.length > 0
        ? [...parsed.users]
        : [...DEFAULT_NOC_ACCOUNTS];
    let forceSave = false;

    // Ensure dedicated Administrator account exists even on migrated databases
    if (!sourceUsers.some((u) => u.role === "Administrator" || u.username === "superadmin")) {
      sourceUsers = [DEFAULT_NOC_ACCOUNTS[0], ...sourceUsers];
      forceSave = true;
    }

    const sourceRoles =
      Array.isArray(parsed.roles) && parsed.roles.length > 0
        ? parsed.roles
        : DEFAULT_ROLE_DEFINITIONS;
    const { users, changed } = migrateAccountRecords(sourceUsers);

    if (parsed.version !== CURRENT_RBAC_VERSION || changed || forceSave) {
      const upgraded: RbacStore = {
        version: CURRENT_RBAC_VERSION,
        roles: sourceRoles,
        users,
      };
      const tmpFile = `${RBAC_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(upgraded, null, 2), "utf8");
      fs.renameSync(tmpFile, RBAC_FILE);
      return upgraded;
    }
    return {
      version: parsed.version,
      roles: sourceRoles,
      users,
    };
  } catch {
    const { users } = migrateAccountRecords(DEFAULT_NOC_ACCOUNTS);
    return {
      version: CURRENT_RBAC_VERSION,
      roles: DEFAULT_ROLE_DEFINITIONS,
      users,
    };
  }
}

export function saveRbacStore(store: RbacStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    store.version = CURRENT_RBAC_VERSION;
    const { users } = migrateAccountRecords(store.users);
    store.users = users;
    const tmpFile = `${RBAC_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(tmpFile, RBAC_FILE);
  } catch (err) {
    console.error("Failed to save RBAC store:", err);
  }
}

interface SessionPayload {
  sub: string;
  exp: number;
}

export function createSessionToken(
  user: NocUser,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const payload: SessionPayload = {
    sub: user.id,
    exp: Date.now() + ttlSeconds * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): NocUser | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const expectedSig = crypto
      .createHmac("sha256", getSessionSecret())
      .update(payloadB64)
      .digest("base64url");

    const sigBuf = Buffer.from(sigB64, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as SessionPayload;
    if (!parsed || typeof parsed.sub !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp <= Date.now()) {
      return null;
    }

    const store = loadRbacStore();
    const account = store.users.find(
      (u) => u.id === parsed.sub && u.status === "active"
    );
    if (!account) return null;

    const roleDef = store.roles.find((r) => r.role === account.role);
    const effectivePermissions = roleDef ? roleDef.permissions : account.permissions;
    return {
      ...stripSensitiveUserFields(account),
      permissions: effectivePermissions,
    };
  } catch {
    return null;
  }
}

export function hasPermission(user: NocUser, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}

export function requireSessionUser(
  req: NextRequest,
  requiredPermission?: PermissionKey
): { user: NocUser; response?: never } | { user?: never; response: NextResponse } {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = verifySessionToken(token);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Sesi tidak valid atau telah berakhir. Silakan login kembali." },
        { status: 401 }
      ),
    };
  }
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return {
      response: NextResponse.json(
        {
          error: `Akses ditolak: Role '${user.role}' tidak memiliki izin '${requiredPermission}'.`,
        },
        { status: 403 }
      ),
    };
  }
  return { user };
}

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(clientKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = loginAttempts.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= LOGIN_MAX_FAILURES) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(clientKey: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(clientKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(clientKey: string): void {
  loginAttempts.delete(clientKey);
}

export function authenticateNocUser(
  identifier: string,
  passwordInput: string
): NocUser | null {
  const store = loadRbacStore();
  const cleanId = identifier.trim().toLowerCase();
  const found = store.users.find(
    (acc) =>
      acc.status === "active" &&
      (acc.username.toLowerCase() === cleanId ||
        acc.email.toLowerCase() === cleanId) &&
      verifyPassword(passwordInput, acc)
  );

  if (!found) return null;

  const roleDef = store.roles.find((r) => r.role === found.role);
  const effectivePermissions = roleDef ? roleDef.permissions : found.permissions;

  found.lastLogin = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  saveRbacStore(store);

  return {
    ...stripSensitiveUserFields(found),
    permissions: effectivePermissions,
  };
}
