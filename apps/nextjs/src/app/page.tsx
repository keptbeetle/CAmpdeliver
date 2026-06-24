import { getUser } from "~/auth/server";
import { AuthForm } from "./_components/auth-form";
import { Dashboard } from "./_components/dashboard";

export default async function HomePage() {
  const user = await getUser();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 py-12 text-white">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 -z-10 h-full w-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/20 via-zinc-950 to-black"></div>

      {user ? (
        <Dashboard />
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-lg font-extrabold text-white shadow-lg shadow-purple-600/30">
              CA
            </div>
            <h1 className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              CAmpDeliver
            </h1>
          </div>
          <AuthForm />
        </div>
      )}
    </main>
  );
}
