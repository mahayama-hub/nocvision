import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/omninoc_session=([^;]+)/);
  return match ? `omninoc_session=${match[1]}` : null;
}

async function loginAs(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", username, password }),
  });
  const data = await res.json();
  const setCookie = res.headers.get("set-cookie");
  return {
    status: res.status,
    data,
    setCookie,
    cookie: extractSessionCookie(setCookie),
  };
}

test("1. SSR pages render NOCVISION and return HTTP security headers", async () => {
  for (const route of ["/", "/login"]) {
    const res = await fetch(`${BASE_URL}${route}`);
    assert.equal(res.status, 200, `Expected 200 for ${route}`);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("referrer-policy"));
    const html = await res.text();
    assert.match(html, /NOCVISION/i);
  }
});

test("2. Unauthenticated API calls and forged Base64 cookies are rejected", async () => {
  const unauthChecks = [
    ["GET", "/api/noc"],
    ["POST", "/api/noc", { action: "reset_demo" }],
    ["GET", "/api/users"],
    ["POST", "/api/users", { action: "add_user", fullName: "Intruder" }],
    ["POST", "/api/diagnostics", { tool: "ping", target: "127.0.0.1" }],
    ["GET", "/api/superai"],
    ["POST", "/api/superai", { action: "chat", prompt: "halo" }],
    ["GET", "/api/alerting"],
    ["POST", "/api/alerting", { action: "save_config", telegramEnabled: true }],
  ];

  for (const [method, endpoint, body] of unauthChecks) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(res.status, 401, `Expected 401 on unauth ${method} ${endpoint}`);
  }

  // Attempt forged unsigned Base64 session cookie from legacy vulnerability
  const forgedPayload = Buffer.from(
    JSON.stringify({ id: "usr-01", username: "admin", role: "Tenant Owner" })
  ).toString("base64");
  const forgedCookie = `omninoc_session=${forgedPayload}`;

  const authCheck = await fetch(`${BASE_URL}/api/auth`, {
    headers: { Cookie: forgedCookie },
  });
  const authJson = await authCheck.json();
  assert.equal(authJson.authenticated, false);

  const nocCheck = await fetch(`${BASE_URL}/api/noc`, {
    headers: { Cookie: forgedCookie },
  });
  assert.equal(nocCheck.status, 401);
});

test("3. Login flow validates scrypt credentials and issues signed HttpOnly cookie", async () => {
  const badLogin = await loginAs("superadmin", "wrong-password-123");
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.data.ok, false);

  const okLogin = await loginAs("superadmin", "superadmin123");
  assert.equal(okLogin.status, 200);
  assert.equal(okLogin.data.ok, true);
  assert.equal(okLogin.data.user.username, "superadmin");
  assert.ok(okLogin.cookie, "Expected omninoc_session cookie");
  assert.match(okLogin.setCookie, /HttpOnly/i);
  assert.match(okLogin.setCookie, /SameSite=Lax/i);

  const sessionRes = await fetch(`${BASE_URL}/api/auth`, {
    headers: { Cookie: okLogin.cookie },
  });
  const sessionData = await sessionRes.json();
  assert.equal(sessionData.authenticated, true);
  assert.equal(sessionData.user.username, "superadmin");
});

test("4. Server-side RBAC blocks Auditor mutations even with spoofed actorRole", async () => {
  const superadmin = await loginAs("superadmin", "superadmin123");
  assert.equal(superadmin.status, 200);
  assert.ok(superadmin.cookie);

  const createAud = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "add_user",
      fullName: "E2E Auditor",
      username: "e2e_auditor",
      email: "e2e_auditor@nocvision.id",
      role: "NOC Read-Only / Auditor",
      password: "AuditorPassword1!",
    }),
  });
  assert.equal(createAud.status, 200);
  const audUsers = await createAud.json();
  const tempAud = audUsers.users.find((u) => u.username === "e2e_auditor");
  assert.ok(tempAud);

  const auditor = await loginAs("e2e_auditor", "AuditorPassword1!");
  assert.equal(auditor.status, 200);
  assert.ok(auditor.cookie);

  // Allowed read telemetry (starts empty with 0 devices)
  const getNoc = await fetch(`${BASE_URL}/api/noc`, {
    headers: { Cookie: auditor.cookie },
  });
  assert.equal(getNoc.status, 200);
  const state = await getNoc.json();
  assert.ok(Array.isArray(state.devices));

  // Allowed diagnostics (run_diagnostics)
  const diag = await fetch(`${BASE_URL}/api/diagnostics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: auditor.cookie },
    body: JSON.stringify({ tool: "dns", target: "localhost" }),
  });
  assert.equal(diag.status, 200);

  // Blocked device mutation even when attempting body actorRole spoofing
  const addDev = await fetch(`${BASE_URL}/api/noc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: auditor.cookie },
    body: JSON.stringify({
      action: "add_device",
      name: "SPOOF-ROUTER",
      ipAddress: "10.99.99.1",
      actorRole: "Tenant Owner",
      actorName: "Spoofed Owner",
    }),
  });
  assert.equal(addDev.status, 403);

  // Blocked user management
  const addUser = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: auditor.cookie },
    body: JSON.stringify({
      action: "add_user",
      fullName: "Unauthorized User",
      username: "unauth_u",
    }),
  });
  assert.equal(addUser.status, 403);

  // Cleanup temp auditor
  await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({ action: "delete_user", userId: tempAud.id }),
  });
});

test("5. Admin CRUD, diagnostics, NOCAI status, user secret redaction, and logout", async () => {
  // Dedicated Super Administrator test
  const superadmin = await loginAs("superadmin", "superadmin123");
  assert.equal(superadmin.status, 200);
  assert.equal(superadmin.data.user.role, "Administrator");
  assert.ok(superadmin.cookie);

  // Users directory exposes zero password hints/hashes/plaintext
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Cookie: superadmin.cookie },
  });
  assert.equal(usersRes.status, 200);
  const usersJson = await usersRes.json();
  assert.ok(Array.isArray(usersJson.users) && usersJson.users.length >= 1);
  for (const u of usersJson.users) {
    assert.equal("passwordHint" in u, false);
    assert.equal("passwordPlain" in u, false);
    assert.equal("passwordHash" in u, false);
  }

  // Super Administrator creates a temporary Tenant Owner to verify RBAC boundaries
  const createOwnerRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "add_user",
      fullName: "Temp Tenant Owner",
      username: "e2e_owner",
      email: "e2e_owner@nocvision.id",
      role: "Tenant Owner",
      password: "OwnerPassword1!",
    }),
  });
  assert.equal(createOwnerRes.status, 200);
  const ownerUsersJson = await createOwnerRes.json();
  const tempOwner = ownerUsersJson.users.find((u) => u.username === "e2e_owner");
  assert.ok(tempOwner);

  const admin = await loginAs("e2e_owner", "OwnerPassword1!");
  assert.equal(admin.status, 200);
  assert.ok(admin.cookie);

  // Super Administrator can create any role (including Administrator)
  const superCreateAdmin = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "add_user",
      fullName: "Secondary Admin",
      username: "admin_secondary",
      email: "secadmin@nocvision.id",
      role: "Administrator",
      password: "SecAdmin12345!",
    }),
  });
  assert.equal(superCreateAdmin.status, 200);
  const secAdminJson = await superCreateAdmin.json();
  const secUser = secAdminJson.users.find((u) => u.username === "admin_secondary");
  assert.ok(secUser && secUser.role === "Administrator");

  // Super Administrator can edit any user's profile and credentials
  const superEditRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "update_user",
      userId: secUser.id,
      fullName: "Updated Secondary Admin",
      phone: "+62 811-9988-7766",
      shift: "Shift Malam Senior",
    }),
  });
  assert.equal(superEditRes.status, 200);
  const superEditJson = await superEditRes.json();
  const verifiedEdited = superEditJson.users.find((u) => u.id === secUser.id);
  assert.equal(verifiedEdited.fullName, "Updated Secondary Admin");
  assert.equal(verifiedEdited.phone, "+62 811-9988-7766");

  // Clean up secondary admin (Superadmin can delete users)
  const delSecRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({ action: "delete_user", userId: secUser.id }),
  });
  assert.equal(delSecRes.status, 200);

  // Tenant Owner cannot create Administrator or Tenant Owner users
  for (const blockedRole of ["Administrator", "Tenant Owner"]) {
    const blockedCreate = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({
        action: "add_user",
        fullName: `Blocked ${blockedRole}`,
        username: `blocked_${blockedRole.toLowerCase().replace(/\s+/g, "_")}`,
        email: `blocked_${blockedRole.toLowerCase().replace(/\s+/g, "_")}@nocvision.id`,
        role: blockedRole,
        password: "BlockedPassword1!",
      }),
    });
    assert.equal(
      blockedCreate.status,
      403,
      `Tenant Owner must be blocked (403) from creating ${blockedRole}`
    );
  }

  // Create & delete temporary subordinate NOC user (NOC Engineer)
  const createUserRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({
      action: "add_user",
      fullName: "E2E Temp Operator",
      username: "e2e_temp_user",
      email: "e2e_temp@nocvision.id",
      role: "NOC Engineer",
      password: "E2eTempPassword!",
    }),
  });
  assert.equal(createUserRes.status, 200);
  const createdUsers = await createUserRes.json();
  const tempUser = createdUsers.users.find((u) => u.username === "e2e_temp_user");
  assert.ok(tempUser, "Temporary E2E user should exist");

  // Tenant Owner cannot escalate subordinate user to Administrator
  const escalateRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({
      action: "update_user",
      userId: tempUser.id,
      role: "Administrator",
    }),
  });
  assert.equal(escalateRes.status, 403);

  // Tenant Owner CAN assign subordinate role (e.g. NOC Read-Only / Auditor)
  const downgradeRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({
      action: "update_user",
      userId: tempUser.id,
      role: "NOC Read-Only / Auditor",
    }),
  });
  assert.equal(downgradeRes.status, 200);

  const tempLogin = await loginAs("e2e_temp_user", "E2eTempPassword!");
  assert.equal(tempLogin.status, 200);

  const deleteUserRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ action: "delete_user", userId: tempUser.id }),
  });
  assert.equal(deleteUserRes.status, 200);

  // Add & delete device
  const addDevRes = await fetch(`${BASE_URL}/api/noc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({
      action: "add_device",
      name: "E2E-TEST-RTR",
      vendor: "MikroTik",
      role: "core_router",
      ipAddress: "10.254.254.1",
      pollingMode: "simulation",
    }),
  });
  assert.equal(addDevRes.status, 200);
  const addDevData = await addDevRes.json();
  assert.equal(addDevData.ok, true);
  assert.equal(addDevData.device.name, "E2E-TEST-RTR");

  const delDevRes = await fetch(`${BASE_URL}/api/noc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ action: "delete_device", deviceId: addDevData.device.id }),
  });
  assert.equal(delDevRes.status, 200);

  // NOCAI status check
  const aiStatusRes = await fetch(`${BASE_URL}/api/superai`, {
    headers: { Cookie: admin.cookie },
  });
  assert.equal(aiStatusRes.status, 200);
  const aiStatus = await aiStatusRes.json();
  assert.equal(typeof aiStatus.configured, "boolean");
  assert.ok(aiStatus.model);

  // Alerting (Telegram & WhatsApp Bot API) config + token masking check
  const alertSaveRes = await fetch(`${BASE_URL}/api/alerting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "save_config",
      telegramEnabled: true,
      telegramBotToken: "123456789:AAH_E2E_TEST_TOKEN_SECRET_VALUE",
      telegramChatId: "-1001234567890",
      whatsappEnabled: true,
      whatsappProvider: "fonnte",
      whatsappToken: "wa-secret-token-998877",
      whatsappTarget: "6281234567890",
    }),
  });
  assert.equal(alertSaveRes.status, 200);
  const alertSaveJson = await alertSaveRes.json();
  assert.equal(alertSaveJson.ok, true);
  assert.equal(alertSaveJson.config.hasTelegramToken, true);
  assert.equal(alertSaveJson.config.hasWhatsappToken, true);
  assert.equal("telegramBotToken" in alertSaveJson.config, false);
  assert.equal("whatsappToken" in alertSaveJson.config, false);

  // Disable test bot channels before running cyber alert simulation so no external network calls block E2E
  await fetch(`${BASE_URL}/api/alerting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "save_config",
      telegramEnabled: false,
      whatsappEnabled: false,
      clearTelegramToken: true,
      clearWhatsappToken: true,
    }),
  });

  // Cyber threat test + mitigate_threat + authAccessLogs verification
  const cyberRes = await fetch(`${BASE_URL}/api/alerting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({ action: "test_cyber_alert" }),
  });
  assert.equal(cyberRes.status, 200);
  const cyberJson = await cyberRes.json();
  assert.equal(cyberJson.ok, true);
  assert.ok(Array.isArray(cyberJson.cyberThreats) && cyberJson.cyberThreats.length >= 1);

  const mitigateRes = await fetch(`${BASE_URL}/api/alerting`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({
      action: "mitigate_threat",
      threatId: cyberJson.cyberThreats[0].id,
    }),
  });
  assert.equal(mitigateRes.status, 200);
  const mitigateJson = await mitigateRes.json();
  assert.equal(mitigateJson.cyberThreats[0].status, "mitigated");

  const alertGetRes = await fetch(`${BASE_URL}/api/alerting`, {
    headers: { Cookie: superadmin.cookie },
  });
  assert.equal(alertGetRes.status, 200);
  const alertGetJson = await alertGetRes.json();
  assert.ok(Array.isArray(alertGetJson.authAccessLogs) && alertGetJson.authAccessLogs.length >= 2);
  assert.ok(alertGetJson.authAccessLogs.some((l) => l.outcome === "success" && l.username === "superadmin"));
  assert.ok(alertGetJson.authAccessLogs.some((l) => l.outcome === "failed"));

  // Diagnostics ping loopback check
  const pingRes = await fetch(`${BASE_URL}/api/diagnostics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ tool: "ping", target: "127.0.0.1", count: 1 }),
  });
  assert.equal(pingRes.status, 200);
  const pingJson = await pingRes.json();
  assert.equal(pingJson.ok, true);
  assert.equal(pingJson.result.alive, true);

  // Clean up temp Tenant Owner
  await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({ action: "delete_user", userId: tempOwner.id }),
  });

  // Reset state so workspace data remains empty
  const resetRes = await fetch(`${BASE_URL}/api/noc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superadmin.cookie },
    body: JSON.stringify({ action: "reset_demo" }),
  });
  assert.equal(resetRes.status, 200);

  // Logout clears cookie
  const logoutRes = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin.cookie },
    body: JSON.stringify({ action: "logout" }),
  });
  assert.equal(logoutRes.status, 200);
  const logoutCookie = logoutRes.headers.get("set-cookie") || "";
  assert.match(logoutCookie, /Max-Age=0/i);
});

