import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROLES = ["admin", "purchase", "store", "sales"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: string;
}

function validate(input: Partial<CreateUserInput>): string | null {
  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return "Enter a valid email address";
  if (!input.password || input.password.length < 8) return "Password must be at least 8 characters";
  if (!input.full_name || input.full_name.trim().length < 2) return "Enter the person's full name";
  if (!input.phone || !/^[0-9]{10}$/.test(input.phone)) return "Phone number must be 10 digits";
  if (!input.role || !ROLES.includes(input.role)) return "Choose a valid role";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Please sign in again" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: me, error: meError } = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (meError) return json({ error: "Could not check permissions" }, 500);
    if (!me || me.role !== "admin" || !me.is_active) {
      return json({ error: "Only admins can create users" }, 403);
    }

    const input = (await req.json()) as Partial<CreateUserInput>;
    const problem = validate(input);
    if (problem) return json({ error: problem }, 400);

    const email = input.email!.trim().toLowerCase();
    const fullName = input.full_name!.trim();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: input.password!,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Could not create the account" }, 400);
    }

    const newId = created.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: newId,
      full_name: fullName,
      phone: input.phone,
      role: input.role,
      is_active: true,
      created_by: userData.user.id,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(newId);
      return json({ error: "Could not save the staff profile" }, 500);
    }

    await admin.from("audit_log").insert({
      action: "user_created",
      entity: "profile",
      entity_id: newId,
      new_values: { email, full_name: fullName, role: input.role },
      created_by: userData.user.id,
    });

    return json({ id: newId }, 201);
  } catch (err) {
    console.error("admin-create-user failed", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
