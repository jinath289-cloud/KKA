import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ROLES = ["admin", "purchase", "store", "sales"] as const;
type Role = (typeof ROLES)[number];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Apikey, Content-Type, X-Client-Info",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: Role;
}

function validate(input: unknown): CreateUserInput | string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Request body must be a JSON object";
  }

  const body = input as Record<string, unknown>;
  const email = body.email;
  const password = body.password;
  const fullName = body.full_name;
  const phone = body.phone;
  const role = body.role;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof fullName !== "string" ||
    typeof phone !== "string" ||
    typeof role !== "string"
  ) {
    return "Email, password, full name, phone, and role must be strings";
  }
  if (email.length > 254) return "Email must be 254 characters or fewer";
  if (password.length > 128) return "Password must be 128 characters or fewer";
  if (fullName.length > 100) return "Full name must be 100 characters or fewer";
  if (phone.length > 10) return "Phone number must be exactly 10 digits";
  if (role.length > 16) return "Choose a valid role";

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "Enter a valid email address";
  }
  if (password.length < 8) return "Password must be at least 8 characters";
  if (normalizedName.length < 2) return "Enter the person's full name";
  if (!/^[0-9]{10}$/.test(phone)) return "Phone number must be 10 digits";
  if (!isRole(role)) return "Choose a valid role";

  return { email: normalizedEmail, password, full_name: normalizedName, phone, role };
}

async function rollbackCreatedUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (profileError || authError) {
    console.error("admin-create-user rollback failed", { profileError, authError });
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Origin is not allowed" }, 403, headers);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

    if (!req.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
      return json({ error: "Content-Type must be application/json" }, 415, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("admin-create-user is missing required Supabase environment configuration");
      return json({ error: "The account service is not configured" }, 500, headers);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Please sign in again" }, 401, headers);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: me, error: meError } = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (meError) return json({ error: "Could not check permissions" }, 500, headers);
    if (!me || me.role !== "admin" || !me.is_active) {
      return json({ error: "Only admins can create users" }, 403, headers);
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400, headers);
    }

    const input = validate(requestBody);
    if (typeof input === "string") return json({ error: input }, 400, headers);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name },
    });
    if (createError || !created.user) {
      const alreadyExists =
        createError?.code === "user_already_exists" ||
        (createError?.message ?? "").toLowerCase().includes("already");
      return json(
        { error: alreadyExists ? "An account with this email already exists" : "Could not create the account" },
        alreadyExists ? 409 : 400,
        headers,
      );
    }

    const newId = created.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: newId,
      full_name: input.full_name,
      phone: input.phone,
      role: input.role,
      is_active: true,
      created_by: userData.user.id,
    });
    if (profileError) {
      console.error("admin-create-user could not save the staff profile", profileError);
      const rolledBack = await rollbackCreatedUser(admin, newId);
      return json(
        {
          error: rolledBack
            ? "Could not save the staff profile. The new account was rolled back."
            : "Could not save the staff profile, and automatic account cleanup failed. Contact an administrator.",
        },
        500,
        headers,
      );
    }

    const { error: auditError } = await admin.from("audit_log").insert({
      action: "user_created",
      entity: "profile",
      entity_id: newId,
      new_values: { email: input.email, full_name: input.full_name, role: input.role },
      created_by: userData.user.id,
    });
    if (auditError) {
      console.error("admin-create-user could not write the audit record", auditError);
      const rolledBack = await rollbackCreatedUser(admin, newId);
      return json(
        {
          error: rolledBack
            ? "Could not write the audit record. The new account was rolled back."
            : "Could not write the audit record, and automatic account cleanup failed. Contact an administrator.",
        },
        500,
        headers,
      );
    }

    return json({ id: newId }, 201, headers);
  } catch (err) {
    console.error("admin-create-user failed", err);
    return json({ error: "Something went wrong. Please try again." }, 500, headers);
  }
});
