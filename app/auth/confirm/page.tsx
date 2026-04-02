import { CheckCircle } from "lucide-react";
import { AuthCard } from "@/components/auth-card";

export default function ConfirmPage() {
  return (
    <AuthCard>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 shrink-0 text-green-300" />
          <p className="text-base font-medium text-white">Email confirmed!</p>
        </div>
        <p className="text-sm text-white/70">
          Open the app on your phone and sign in to get started.
        </p>
      </div>
    </AuthCard>
  );
}
