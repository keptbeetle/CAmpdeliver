import { getUser } from "~/auth/server";
import { AuthForm } from "./_components/auth-form";
import { Dashboard } from "./_components/dashboard";

export default async function HomePage() {
  const user = await getUser();

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center py-12 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/20 via-zinc-950 to-black -z-10"></div>
      
      {user ? (
        <Dashboard />
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-extrabold text-white text-lg shadow-lg shadow-purple-600/30">
              CA
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              CAmpDeliver
            </h1>
          </div>
          <AuthForm />
        </div>
      )}
    </main>
  );
}
