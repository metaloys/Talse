"use client";

import { useEffect, useMemo, useState } from "react";
import { useServices } from "@/contexts/services-context";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { formatDate, timeAgo, type HireRequest } from "@/lib/services/data";

type ConversationMessage = { id: string; senderPiId: string; text: string; createdAt: number; attachments?: string[] };
import { Button, Card, EmptyState, Pill, TextArea, IconButton } from "./ui";
import { IconInbox, IconSend, IconPaperclip, IconTrash } from "./icons";

// Messaging is available once a request has moved past "accepted" (i.e. the
// buyer/provider are actively engaged) through completion — not just the
// single "accepted" status from the old mocked flow.
const MESSAGING_STATUSES = new Set(["accepted", "locked", "delivered", "released", "disputed"]);

export function MessagesScreen({ initialRequestId }: { initialRequestId?: string }) {
  const { requests, messagesForRequest, sendMessage, loadMessagesForRequest, currentUid } = useServices();
  const accepted = useMemo(() => requests.filter((r) => MESSAGING_STATUSES.has(r.status)), [requests]);
  const [selectedId, setSelectedId] = useState<string | null>(accepted[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { accessToken } = usePiAuth();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const selected = accepted.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (initialRequestId) {
      const match = accepted.find((r) => r.id === initialRequestId);
      setSelectedId(match ? match.id : accepted[0]?.id ?? null);
    } else {
      setSelectedId(accepted[0]?.id ?? null);
    }
  }, [accepted, initialRequestId]);

  useEffect(() => {
    if (selected) void loadMessagesForRequest(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const submit = async () => {
    const text = draft.trim();
    if (!selected || !text) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      // if files selected, upload them first
      let paths: string[] = [];
      if (files.length) {
        setUploading(true);
        const form = new FormData();
        files.forEach((f) => form.append("file", f));
        const res = await fetch(`/api/hire-requests/${selected.id}/attachments`, { method: "POST", body: form, headers: { Authorization: `Bearer ${accessToken ?? ""}` } });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        paths = data.paths ?? [];
        setFiles([]);
        setUploading(false);
      }
      await sendMessage(selected.id, text, paths);
      setDraft("");
      setState("sent");
    } catch (err) {
      console.error("[Messages] Send failed:", err);
      setState("error");
    }
  };

  return (
    <div className="mx-auto max-w-md pb-24">
      <header className="ps-hero-grad px-4 pb-4 pt-4 ps-safe-top">
        <p className="ps-eyebrow">Private workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conversation history for accepted hire requests.</p>
      </header>
      <div className="grid gap-3 px-4 pt-4">
        {accepted.length === 0 ? (
          <EmptyState icon={<IconInbox size={26} />} title="No conversations yet" message="Messages become available after a hire request is accepted. Demo messages are not real-time or shared." />
        ) : (
          <>
            <div className="space-y-2" aria-label="Conversation list">
              {accepted.map((request) => <ConversationRow key={request.id} request={request} active={request.id === selectedId} onClick={() => { setSelectedId(request.id); setState("idle"); }} />)}
            </div>
            {selected && <ConversationView request={selected} messages={messagesForRequest(selected.id)} username={currentUid ?? ""} draft={draft} setDraft={setDraft} state={state} onSend={submit} files={files} setFiles={setFiles} uploading={uploading} />}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ request, active, onClick }: { request: HireRequest; active: boolean; onClick: () => void }) {
  const { messagesForRequest } = useServices();
  const messages = messagesForRequest(request.id);
  const last = messages[messages.length - 1];
  return <button type="button" onClick={onClick} className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-secondary"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-foreground">{request.serviceTitle}</p><p className="mt-1 text-xs text-muted-foreground">{request.requesterPiId === request.providerPiId ? "Conversation" : `With ${request.requesterName === "Pioneer" ? request.providerName : request.requesterName}`}</p></div><Pill tone="success">{request.status}</Pill></div><p className="mt-2 truncate text-xs text-muted-foreground">{last?.text ?? "No messages yet"}</p>{last && <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(last.createdAt)}</p>}</button>;
}

function ConversationView({ request, messages, username, draft, setDraft, state, onSend, files, setFiles, uploading }: { request: HireRequest; messages: ConversationMessage[]; username: string; draft: string; setDraft: (value: string) => void; state: "idle" | "sending" | "sent" | "error"; onSend: () => void; files: File[]; setFiles: (f: File[]) => void; uploading: boolean }) {
  const { loadMessagesForRequest } = useServices();
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [noMoreEarlier, setNoMoreEarlier] = useState(false);
  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    if (!chosen.length) return;
    const cap = 6 - chosen.length;
    const toAdd = chosen.slice(0, cap);
    setFiles([...files, ...toAdd]);
    e.currentTarget.value = "";
  };

  const removeFile = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  const handleLoadEarlier = async () => {
    if (loadingEarlier || noMoreEarlier) return;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;
    setLoadingEarlier(true);
    try {
      const before = new Date(oldest).toISOString();
      const res = await loadMessagesForRequest(request.id, before as any);
      if (!res || res.fetched === 0) setNoMoreEarlier(true);
    } catch (err) {
      console.error("Failed to load earlier messages:", err);
    } finally {
      setLoadingEarlier(false);
    }
  };

  return <Card className="overflow-hidden"><div className="border-b border-border p-4"><div className="flex items-start justify-between gap-2"><div><h2 className="text-base font-bold text-foreground">{request.serviceTitle}</h2><p className="mt-1 text-xs text-muted-foreground">{request.providerName} · {request.customerName}</p></div><Pill tone="neutral">Request {request.id.slice(0, 8)}</Pill></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>Service {request.serviceId}</span><span>Created {formatDate(new Date(request.createdAt).toISOString())}</span></div></div><div className="min-h-36 space-y-2 bg-secondary/40 p-3" aria-live="polite">{messages.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">No messages in this conversation yet.</p> : (<>{!noMoreEarlier && messages.length > 0 && <div className="mb-2 text-center"><Button size="sm" variant="outline" onClick={handleLoadEarlier} disabled={loadingEarlier}>{loadingEarlier ? "Loading…" : "Load earlier messages"}</Button></div>} {messages.map((message) => <div key={message.id} className={`flex ${message.senderPiId === username ? "justify-end" : "justify-start"}`}><div className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm ${message.senderPiId === username ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}><p className="whitespace-pre-wrap">{message.text}</p>{message.attachments && message.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{message.attachments.map((a: string, i: number) => <a key={i} href={a} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-secondary px-2 py-1 text-xs text-secondary-foreground">{a.endsWith('.pdf') ? <IconPaperclip size={12} /> : <img src={a} alt="attachment" className="h-8 w-8 object-cover rounded" />}<span className="truncate max-w-[8rem]">{a.split('/').pop()}</span></a>)}</div>}<p className="mt-1 text-[10px] opacity-70">{timeAgo(message.createdAt)} · {message.senderPiId === username ? "You" : "Participant"}</p></div></div>)}</>)} </div><div className="border-t border-border p-3"><TextArea aria-label="Message" value={draft} maxLength={600} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" className="min-h-20" />{state === "error" && <p className="mt-1 text-xs font-medium text-destructive">Select an accepted request and enter a message.</p>}{state === "sent" && <p className="mt-1 text-xs font-medium text-success">Message saved in this session.</p>}<div className="mt-2 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><input id="msg-files" type="file" accept="image/*,application/pdf" multiple onChange={onFileSelected} className="hidden" /><label htmlFor="msg-files" className="ps-press inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">Attach</label>{uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}</div><Button size="sm" onClick={onSend} disabled={state === "sending"}>{state === "sending" ? "Sending…" : <><IconSend size={14} /> Send</>}</Button></div>{files.length > 0 && <div className="mt-2 space-y-1.5">{files.map((f, i) => (<div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm"><IconPaperclip size={15} className="shrink-0 text-muted-foreground" /><span className="ps-clamp-1 flex-1 text-foreground">{f.name}</span><IconButton label="Remove file" className="h-7 w-7 text-muted-foreground" onClick={() => removeFile(i)}><IconTrash size={15} /></IconButton></div>))}</div>}</div></Card>;
}
