"use client";

import { useState, useTransition } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Copy,
  Check,
  LogOut,
} from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/inline-error";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { glassSectionIconClass } from "@/lib/glass-classes";
import {
  accountsSwrKey,
  membersSwrKey,
  pendingInvitationsSwrKey,
  transactionsSwrKey,
} from "@/lib/swr-keys";
import { invalidateNext12CalendarMonths } from "@/lib/swr-invalidate";
import { fetchPendingInvitations } from "@/lib/api";
import {
  createInvitation,
  removeMember,
  revokeInvitation,
  leaveAccount,
} from "@/lib/transactions-mutations";
import { getAccountMembers } from "@/lib/member-actions";
import { useActiveAccount } from "@/components/active-account-provider";

interface BudgetMembersSectionProps {
  accountId: string;
  role: "owner" | "member";
}

export function BudgetMembersSection({
  accountId,
  role,
}: BudgetMembersSectionProps) {
  const { mutate } = useSWRConfig();
  const { accounts, setActiveAccount } = useActiveAccount();
  const isOwner = role === "owner";

  // P2-4: use SWR instead of bare useEffect+useState — cache, dedup, revalidate on remount
  const { data: membersResult, isLoading: membersLoading } = useSWR(
    membersSwrKey(accountId),
    () => getAccountMembers(accountId),
  );
  const members = membersResult?.data ?? [];

  const { data: pendingInvitations = [], mutate: mutatePending } = useSWR(
    isOwner ? pendingInvitationsSwrKey(accountId) : null,
    () => fetchPendingInvitations(accountId),
  );

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, startInviteTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, startRemoveTransition] = useTransition();

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevoking, startRevokeTransition] = useTransition();
  // P3-1: track which pending invitation was just copy-linked for UX feedback
  const [copiedInvId, setCopiedInvId] = useState<string | null>(null);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, startLeaveTransition] = useTransition();

  function closeInviteDialog() {
    setInviteDialogOpen(false);
    setInviteEmail("");
    setInviteLink(null);
    setInviteError(null);
    setCopied(false);
  }

  function handleInvite() {
    setInviteError(null);
    startInviteTransition(async () => {
      // P1-3: check existing membership before generating invite so the owner
      // sees a clear error instead of a confusing failure at acceptance time.
      const emailLower = inviteEmail.trim().toLowerCase();
      if (members.some((m) => m.email.toLowerCase() === emailLower)) {
        setInviteError("This person already has access to this budget.");
        return;
      }
      const { data, error } = await createInvitation(accountId, inviteEmail);
      if (error || !data) {
        setInviteError(error?.message ?? "Something went wrong.");
        return;
      }
      setInviteLink(`${window.location.origin}/invite/${data.token}`);
      void mutatePending();
    });
  }

  function handleCopyLink() {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // P3-1: copy link for already-generated pending invitations
  function handleCopyInviteLink(token: string, invId: string) {
    const link = `${window.location.origin}/invite/${token}`;
    void navigator.clipboard.writeText(link);
    setCopiedInvId(invId);
    setTimeout(() => setCopiedInvId(null), 2000);
  }

  function handleRemove(userId: string) {
    setRemovingUserId(userId);
    setRemoveError(null);
    startRemoveTransition(async () => {
      const { error } = await removeMember(accountId, userId);
      if (error) {
        setRemoveError(error.message);
        setRemovingUserId(null);
        return;
      }
      void mutate(membersSwrKey(accountId));
      setRemovingUserId(null);
    });
  }

  function handleRevoke(invitationId: string) {
    setRevokingId(invitationId);
    startRevokeTransition(async () => {
      const { error } = await revokeInvitation(invitationId);
      if (!error) void mutatePending();
      setRevokingId(null);
    });
  }

  function handleLeave() {
    setLeaveError(null);
    startLeaveTransition(async () => {
      const { error } = await leaveAccount(accountId);
      if (error) {
        setLeaveError(error.message);
        return;
      }
      const next = accounts.find((a) => a.id !== accountId);
      if (next) setActiveAccount(next.id);
      void mutate(accountsSwrKey);
      // P2-3: clear stale cached data for the account we just left
      void mutate(transactionsSwrKey(accountId));
      invalidateNext12CalendarMonths(accountId);
      setLeaveOpen(false);
    });
  }

  return (
    <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-3">
          <div className={glassSectionIconClass}>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-white">Members</span>
        </div>
        {isOwner && (
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-xl border-white/20 bg-white/10 text-xs text-white hover:bg-white/20 active:bg-white/15"
            onClick={() => setInviteDialogOpen(true)}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Invite
          </Button>
        )}
      </div>

      {membersLoading ? (
        <p className="text-xs text-white/50">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="truncate text-sm text-white">
                  {member.email}
                </span>
                <span className="text-xs text-white/50">
                  {member.role === "owner" ? "Owner" : "Member"}
                </span>
              </div>
              {isOwner && member.role !== "owner" && (
                <button
                  type="button"
                  aria-label={`Remove ${member.email}`}
                  disabled={isRemoving && removingUserId === member.user_id}
                  onClick={() => handleRemove(member.user_id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-colors hover:border-destructive/40 hover:bg-destructive/15 hover:text-red-300 active:bg-destructive/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {removeError && <InlineError>{removeError}</InlineError>}

      {isOwner && pendingInvitations.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-white/50">
            Pending invitations
          </span>
          <ul className="flex flex-col gap-1.5">
            {pendingInvitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="truncate text-sm text-white/70">
                    {inv.invited_email}
                  </span>
                </div>
                {/* P3-1: copy link button so owners can re-share without revoking */}
                <button
                  type="button"
                  aria-label={`Copy invite link for ${inv.invited_email}`}
                  onClick={() => handleCopyInviteLink(inv.token, inv.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white active:bg-white/15"
                >
                  {copiedInvId === inv.id ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Revoke invitation for ${inv.invited_email}`}
                  disabled={isRevoking && revokingId === inv.id}
                  onClick={() => handleRevoke(inv.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-colors hover:border-destructive/40 hover:bg-destructive/15 hover:text-red-300 active:bg-destructive/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isOwner && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 active:bg-white/15"
          onClick={() => setLeaveOpen(true)}
        >
          <LogOut className="h-4 w-4" />
          Leave budget
        </button>
      )}

      <Dialog
        open={inviteDialogOpen}
        onOpenChange={(open) => !open && closeInviteDialog()}
      >
        <DialogContent className="border-white/20 bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
          </DialogHeader>
          {inviteLink ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Share this link with {inviteEmail}. It expires in 7 days.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="h-11 flex-1 rounded-xl border-border bg-background text-sm text-foreground"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 rounded-xl border-border"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl border-border bg-muted text-foreground hover:bg-muted/80"
                onClick={closeInviteDialog}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="inviteEmail"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Email address
                </Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (inviteEmail.trim()) handleInvite();
                    }
                  }}
                  placeholder="friend@example.com"
                  className="h-11 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
                  autoComplete="off"
                />
              </div>
              {inviteError && <InlineError light>{inviteError}</InlineError>}
              <Button
                type="button"
                disabled={isInviting || !inviteEmail.trim()}
                onClick={handleInvite}
                className="h-11 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {isInviting ? "Generating link…" : "Generate invite link"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={leaveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLeaveOpen(false);
            setLeaveError(null);
          }
        }}
      >
        <AlertDialogContent className="border-white/20 bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave budget?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll lose access to this budget and all its transactions.
              The budget owner can invite you back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {leaveError && <InlineError light>{leaveError}</InlineError>}
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleLeave();
              }}
              disabled={isLeaving}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
            >
              Leave budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
