"use client";

import { useEffect, useState } from "react";
import {
  MESSAGE_MAX,
  cleanStr,
  deliveryLabel,
  formatPi,
  serviceImage,
  todayISO,
  type Service,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Overlay } from "./feedback";
import { Button, Card, cx, Field, IconButton, TextArea, TextInput } from "./ui";
import { IconClock, IconPaperclip, IconPlus, IconSend, IconTrash } from "./icons";

export function HireForm({
  service,
  open,
  onClose,
  onSent,
}: {
  service: Service | null;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { hire } = useServices();
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachDraft, setAttachDraft] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setMessage("");
      setDeadline("");
      setAttachments([]);
      setAttachDraft("");
      setShowErrors(false);
    }
  }, [open, service?.id]);

  if (!service) return null;

  const trimmedMsg = message.trim();
  const msgError = trimmedMsg.length < 5 ? "Please describe what you need (at least 5 characters)." : "";
  const deadlineError = !deadline ? "Choose a preferred deadline." : "";
  const canSend = !msgError && !deadlineError;

  const addAttachment = () => {
    const clean = cleanStr(attachDraft, 80);
    if (!clean) return;
    setAttachments((prev) => (prev.length >= 6 ? prev : [...prev, clean]));
    setAttachDraft("");
  };

  const submit = () => {
    if (!canSend) {
      setShowErrors(true);
      return;
    }
    hire({ service, message: trimmedMsg, deadline, attachments });
    onSent();
  };

  const img = service.images[0];

  return (
    <Overlay open={open} onClose={onClose} title="Hire request">
      <div className="mx-auto max-w-md space-y-4 p-4 pb-28">
        {/* service recap */}
        <Card className="flex items-center gap-3 p-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary">
            <img
              src={img ? serviceImage(img, 120, 120) : "/placeholder.svg?height=120&width=120&query=service"}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="ps-clamp-1 text-sm font-semibold text-foreground">{service.title}</h3>
            <p className="text-xs text-muted-foreground">by {service.ownerName}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-bold text-primary ps-nums">{formatPi(service.price)}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <IconClock size={12} />
                {deliveryLabel(service.deliveryId)}
              </span>
            </div>
          </div>
        </Card>

        <Field
          label="What do you need?"
          htmlFor="hire-msg"
          error={showErrors ? msgError : undefined}
          counter={`${message.length}/${MESSAGE_MAX}`}
        >
          <TextArea
            id="hire-msg"
            rows={5}
            maxLength={MESSAGE_MAX}
            placeholder="Describe the work, any details, and questions you have…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>

        <Field label="Preferred deadline" htmlFor="hire-deadline" error={showErrors ? deadlineError : undefined}>
          <TextInput
            id="hire-deadline"
            type="date"
            min={todayISO()}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>

        <Field label="Reference notes (optional)" hint="Add short notes or links to references. Files can be shared with the provider once they accept.">
          <div className="flex gap-2">
            <TextInput
              placeholder="e.g. Brand colors, example link…"
              value={attachDraft}
              maxLength={80}
              onChange={(e) => setAttachDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  addAttachment();
                }
              }}
            />
            <IconButton
              label="Add reference"
              className="h-11 w-11 shrink-0 border border-border bg-card"
              onClick={addAttachment}
            >
              <IconPlus size={18} />
            </IconButton>
          </div>
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm"
                >
                  <IconPaperclip size={15} className="shrink-0 text-muted-foreground" />
                  <span className="ps-clamp-1 flex-1 text-foreground">{a}</span>
                  <IconButton
                    label="Remove reference"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <IconTrash size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </Field>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Sending a request starts a conversation. Agree on the details and terms directly with the provider before any
          work begins.
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button className={cx("w-full")} size="lg" onClick={submit}>
            <IconSend size={18} />
            Send hire request
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
