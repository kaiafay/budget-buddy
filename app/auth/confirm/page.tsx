import Image from "next/image";
import { CheckCircle } from "lucide-react";

export default function ConfirmPage() {
  return (
    <div className="animated-gradient flex min-h-screen items-center justify-center px-6">
      <div className="glass-card w-full max-w-sm rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 pb-10">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl">
            <Image
              src="/apple-touch-icon.png"
              alt=""
              width={56}
              height={56}
              className="object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Budget Buddy
          </h1>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 shrink-0 text-green-300" />
            <p className="text-base font-medium text-white">Email confirmed!</p>
          </div>
          <p className="text-sm text-white/70">
            Open the app on your phone and sign in to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
