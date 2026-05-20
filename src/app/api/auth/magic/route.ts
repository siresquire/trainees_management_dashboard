import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { access_token, refresh_token } = await request.json();
  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookiesToSet: { name: string; value: string; options: any }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => { cookiesToSet.push(...cookies); },
      },
    }
  );

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}
