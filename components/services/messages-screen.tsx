"use client";

import { useEffect, useMemo, useState } from "react";
import { useServices } from "@/contexts/services-context";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { STATUS_META, formatPi, timeAgo, MESSAGE_MAX, type HireRequest } from "@/lib/services/data";
import { backendApi } from "@/lib/backend-api";
import { Button, Card, EmptyState, Pill, TextArea, cx } from "./ui";
import { Overlay } from "./feedback";
import { IconInbox, IconPaperclip, IconSend, IconShield, IconTrash } from "./icons";

type ConversationMessage = { id: string; senderPiId: string; text: string; createdAt: number; attachments?: string[] };

// A private thread exists per hire request, and only the buyer and provider on
// that request can see it (enforced server-side by assertParticipant). It is
// offered as soon as a request exists, including while it is still pending, so
// the two sides can clarify scope before agreeing.
const MESSAGING_STATUSES = new Set(["pending", "accepted", "locked", "delivered", "released", "disputed"]);

/** Who the current user is talking to on this request. */
function counterpartName(r: HireRequest): string {
  return r.direction === "incoming" ? r.customerName : r.providerName;
}

export function MessagesScreen({
  initialRequestId,
  headerAction,
  unreadByRequest,
  onRead,
}: {
  initialRequestId?: string;
  headerAction?: React.ReactNode;
  unreadByRequest?: Record<string, number>;
  onRead?: () => void;
}) {
  const { requests, messagesForRequest, sendMessage, loadMessagesForRequest, currentUid } = useServices();
  const { accessToken } = usePiAuth();
  const accepted = useMemo(() => requests.filter((r) => MESSAGING_STATUSES.has(r.status)), [requests]);
  const [selectedId, setSelectedId] = useState<string | null>(accepted[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [helpOpen, setHelpOpen] = useState(false);
  const selected = accepted.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (initialRequestId) {
      const match = accepted.find((r) => r.id === initialRequestId);
      setSelectedId(match ? match.id : accepted[0]?.id ?? null);
    } else {
      setSelectedId(accepted[0]?.id ?? null);
    }
  }, [accepted, initialRequestId]);

  const markRead = async (hireRequestId: string) => {
    if (!accessToken) return;
    try {
      await backendApi.messages.markRead(hireRequestId, accessToken);
      onRead?.();
    } catch (err) {
      console.error("[Messages] mark read failed:", err);
    }
  };

  useEffect(() => {
    if (!selected) return;
    void loadMessagesForRequest(selected.id).then(() => markRead(selected.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Poll the open thread so a new message shows up without a manual refresh.
  // loadMessagesForRequest merges by id, so this never drops loaded history.
  useEffect(() => {
    if (!selected) return;
    const id = selected.id;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadMessagesForRequest(id).then(() => markRead(id));
    }, 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const submit = async () => {
    const text = draft.trim();
    if (!selected || !text) return;
    setState("sending");
    try {
      // Upload any attachments first, then send the message referencing them.
      let paths: string[] = [];
      if (files.length) {
        setUploading(true);
        const form = new FormData();
        files.forEach((f) => form.append("file", f));
        const res = await fetch(`/api/hire-requests/${selected.id}/attachments`, {
          method: "POST",
          body: form,
          headers: { Authorization: `Bearer ${accessToken ?? ""}` },
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        paths = data.paths ?? [];
        setFiles([]);
      }
      await sendMessage(selected.id, text, paths);
      setDraft("");
      setState("idle");
    } catch (err) {
      console.error("[Messages] Send failed:", err);
      setState("error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="ps-hero-grad px-4 pb-4 pt-4 ps-safe-top">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ps-eyebrow">Private workspaces</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Messages</h1>
          </div>
          {headerAction}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          One private conversation per hire request. Only you and the other person can read it.
        </p>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="ps-press mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
        >
          <IconShield size={13} /> How messaging works
        </button>
      </header>
      <div className="grid gap-3 px-4 pt-4">
        {accepted.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={26} />}
            title="No conversations yet"
            message="A private thread opens as soon as a hire request is sent or received. Ask questions before you accept, then use it to share files and coordinate the work."
            action={
              <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)}>
                How messaging works
              </Button>
            }
          />
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <IconShield size={12} /> Private · one thread per hire request
            </p>
            <div className="space-y-2" aria-label="Conversation list">
              {accepted.map((request) => (
                <ConversationRow
                  key={request.id}
                  request={request}
                  active={request.id === selectedId}
                  lastMessage={messagesForRequest(request.id).slice(-1)[0]}
                  unreadCount={unreadByRequest?.[request.id] ?? 0}
                  onClick={() => {
                    setSelectedId(request.id);
                    setState("idle");
                  }}
                />
              ))}
            </div>
            {selected && (
              <ConversationView
                request={selected}
                messages={messagesForRequest(selected.id)}
                username={currentUid ?? ""}
                draft={draft}
                setDraft={setDraft}
                state={state}
                onSend={submit}
                files={files}
                setFiles={setFiles}
                uploading={uploading}
              />
            )}
          </>
        )}
      </div>

      <Overlay open={helpOpen} onClose={() => setHelpOpen(false)} title="How messaging works">
        <div className="mx-auto max-w-md space-y-5 p-4 pb-10 text-sm">
          <section>
            <h3 className="font-bold text-foreground">Private, per request</h3>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Every hire request has its own conversation. Only you and the other person on that request can
              read it — nothing is posted publicly.
            </p>
          </section>
          <section>
            <h3 className="font-bold text-foreground">When it opens</h3>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              As soon as a hire request exists you can use the thread to ask questions and agree on details.
              It stays available through the job, delivery and completion.
            </p>
          </section>
          <section>
            <h3 className="font-bold text-foreground">Messages vs. Chat Room</h3>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Messages</span> are private — they belong to one
              hire request. A <span className="font-semibold text-foreground">Chat Room</span> is public
              community chat that anyone can join, so keep private details out of it.
            </p>
          </section>
          <section>
            <h3 className="font-bold text-foreground">Files</h3>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Attach up to 6 images or PDFs per message to share briefs, proofs or references.
            </p>
          </section>
        </div>
      </Overlay>
    </div>
  );
}

function ConversationRow({
  request,
  active,
  lastMessage,
  unreadCount,
  onClick,
}: {
  request: HireRequest;
  active: boolean;
  lastMessage?: ConversationMessage;
  unreadCount: number;
  onClick: () => void;
}) {
  const counterpart = counterpartName(request);
  const meta = STATUS_META[request.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full rounded-2xl border p-4 text-left transition",
        active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{counterpart}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{request.serviceTitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Pill tone={meta.tone}>{meta.label}</Pill>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{lastMessage?.text ?? "No messages yet"}</p>
      {lastMessage && <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(lastMessage.createdAt)}</p>}
    </button>
  );
}

function ConversationView({
  request,
  messages,
  username,
  draft,
  setDraft,
  state,
  onSend,
  files,
  setFiles,
  uploading,
}: {
  request: HireRequest;
  messages: ConversationMessage[];
  username: string;
  draft: string;
  setDraft: (value: string) => void;
  state: "idle" | "sending" | "error";
  onSend: () => void;
  files: File[];
  setFiles: (f: File[]) => void;
  uploading: boolean;
}) {
  const { loadMessagesForRequest } = useServices();
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [noMoreEarlier, setNoMoreEarlier] = useState(false);
  const counterpart = counterpartName(request);
  const meta = STATUS_META[request.status];

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    if (!chosen.length) return;
    const room = 6 - files.length;
    setFiles([...files, ...chosen.slice(0, Math.max(0, room))]);
    e.currentTarget.value = "";
  };

  const removeFile = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  const handleLoadEarlier = async () => {
    if (loadingEarlier || noMoreEarlier) return;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;
    setLoadingEarlier(true);
    try {
      const res = await loadMessagesForRequest(request.id, new Date(oldest).toISOString());
      if (!res || res.fetched === 0) setNoMoreEarlier(true);
    } catch (err) {
      console.error("Failed to load earlier messages:", err);
    } finally {
      setLoadingEarlier(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground">{counterpart}</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{request.serviceTitle}</p>
          </div>
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Request {request.id.slice(0, 8)} · {formatPi(request.servicePrice)}
        </p>
      </div>

      <div className="min-h-36 space-y-2 bg-secondary/40 p-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No messages yet. Say hello, or ask a question about the job.
          </p>
        ) : (
          <>
            {!noMoreEarlier && (
              <div className="mb-2 text-center">
                <Button size="sm" variant="outline" onClick={handleLoadEarlier} disabled={loadingEarlier}>
                  {loadingEarlier ? "Loading..." : "Load earlier messages"}
                </Button>
              </div>
            )}
            {messages.map((message) => {
              const mine = message.senderPiId === username;
              return (
                <div key={message.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[84%] rounded-2xl px-3 py-2 text-sm",
                      mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.attachments.map((a, i) => {
                          const clean = a.split("?")[0];
                          const name = decodeURIComponent(clean.split("/").pop() ?? "file");
                          return (
                            <a
                              key={i}
                              href={a}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                            >
                              {clean.endsWith(".pdf") ? (
                                <IconPaperclip size={12} />
                              ) : (
                                <img src={a} alt="Attachment" className="h-8 w-8 rounded object-cover" />
                              )}
                              <span className="max-w-[8rem] truncate">{name}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-1 text-[10px] opacity-70">
                      {mine ? "You" : counterpart} · {timeAgo(message.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="border-t border-border p-3">
        {state === "error" && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">
            <span>Couldn&apos;t send. Check your connection and try again.</span>
            <button type="button" onClick={onSend} className="shrink-0 font-bold underline">
              Retry
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message..."
              rows={2}
              maxLength={MESSAGE_MAX}
              className="max-h-32 min-h-[44px] resize-none"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id={`msg-files-${request.id}`}
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={onFileSelected}
                className="hidden"
              />
              <label
                htmlFor={`msg-files-${request.id}`}
                className="ps-press inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground"
              >
                <IconPaperclip size={14} /> Attach
              </label>
              {uploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
              <span className="ml-auto text-[11px] text-muted-foreground">{draft.length}/{MESSAGE_MAX}</span>
            </div>
          </div>
          <Button size="sm" onClick={onSend} disabled={state === "sending" || uploading} aria-label="Send message">
            {state === "sending" ? "Sending..." : <><IconSend size={14} /> Send</>}
          </Button>
        </div>

        {files.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm"
              >
                <IconPaperclip size={15} className="shrink-0 text-muted-foreground" />
                <span className="ps-clamp-1 flex-1 text-foreground">{f.name}</span>
                <button
                  type="button"
                  aria-label="Remove file"
                  className="text-muted-foreground"
                  onClick={() => removeFile(i)}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
