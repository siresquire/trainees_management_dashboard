import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/request-access",
  "/auth/callback",
  "/auth/confirm",
  "/auth/accept-invite",
  "/auth/update-password",
  "/auth/role-redirect",
  "/api/auth/signin",
  "/quiz/take",
];

const ROLE_PREFIXES: Record<string, string[]> = {
  super_admin:  ["/superadmin", "/trainer", "/trainee", "/quizdesk"],
  trainer:      ["/trainer", "/superadmin"],
  trainee:      ["/trainee"],
  quiz_creator: ["/quizdesk", "/trainer"],
  quiz_taker:   ["/quizdesk/take"],
};

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({ request });
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Allow public paths without auth (exact match for "/" to avoid catching everything)
  if (path === "/" || PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return response;
  }

  // Unauthenticated — redirect to login (fresh URL, no stale query params)
  if (!user) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // Fetch role for route-based access control
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as string | undefined;

  if (role) {
    const allowedPrefixes = ROLE_PREFIXES[role] ?? [];
    const isDashboardPath = ["/trainer", "/trainee", "/superadmin", "/quizdesk"].some(
      (p) => path.startsWith(p)
    );

    if (isDashboardPath && !allowedPrefixes.some((p) => path.startsWith(p))) {
      // Redirect to the user's own home
      const home = allowedPrefixes[0] ?? "/login";
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/health).*)"],
};
