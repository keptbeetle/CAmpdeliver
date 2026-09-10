import { getUser } from "~/auth/server";
import { AuthForm } from "./_components/auth-form";
import { Dashboard } from "./_components/dashboard";

export default async function HomePage() {
  const user = await getUser();

  if (user) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 py-12 text-white">
        <div className="absolute top-0 left-0 -z-10 h-full w-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/20 via-zinc-950 to-black" />
        <div className="w-full flex-1 pt-4">
          <Dashboard />
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f9ff] px-5 py-10 text-slate-900">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.72),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(220,252,231,0.72),_transparent_36%)]" />
      <div className="flex w-full max-w-lg flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-700 text-sm font-black text-white shadow-lg shadow-blue-200">
            CA
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-blue-700 uppercase">
              Campus delivery
            </p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              CAmpDeliver
            </h1>
          </div>
        </div>
        <AuthForm />
        <p className="text-center text-xs leading-relaxed text-slate-500">
          Existing test accounts can still sign in. Every new account requires a
          real SMS verification code.
        </p>
      </div>
    </main>
  );
}
