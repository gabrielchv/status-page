import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "./logout-button";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <nav className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-xs text-white">
            up
          </span>
          status-page
        </Link>

        <div className="flex items-center gap-1">
          {user ? (
            <>
              <Link
                href="/monitors"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Monitors
              </Link>
              <span className="px-2 text-sm text-zinc-400">{user.email}</span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
