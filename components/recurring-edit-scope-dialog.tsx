"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecurringEditScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectScope: (scope: "once" | "fromDate") => void | Promise<void>;
}

export function RecurringEditScopeDialog({
  open,
  onOpenChange,
  onSelectScope,
}: RecurringEditScopeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-white/20 bg-card text-card-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle>Update recurring transaction</AlertDialogTitle>
          <AlertDialogDescription>
            How would you like to apply this change?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-amber-600">
          This will override any previous edits made to future occurrences.
        </p>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
          <div className="flex w-full flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80"
              onClick={() => void onSelectScope("once")}
            >
              Just this occurrence
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void onSelectScope("fromDate")}
            >
              This and all future
            </Button>
          </div>
          <AlertDialogCancel className="w-full rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80">
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
