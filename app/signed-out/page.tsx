import Image from "next/image";
import Link from "next/link";

export default async function SignedOutPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="w-full max-w-[420px] rounded-[14px] bg-surface px-8 py-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <Image src="/logo.png" alt="PCS" width={72} height={72} className="mx-auto rounded-full bg-white" />
        <h1 className="mt-3 mb-1 text-xl">PCS Operations</h1>
        <p className="mb-5 text-muted">{reason || "You are signed out."}</p>
        <Link href="/api/auth/login" className="inline-block rounded-lg bg-accent px-[18px] py-2.5 font-semibold text-white no-underline">
          Sign in
        </Link>
      </div>
    </main>
  );
}
