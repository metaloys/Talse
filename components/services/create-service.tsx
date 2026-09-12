"use client";

import { useEffect, useState } from "react";
import {
  CATEGORIES,
  DELIVERY_OPTIONS,
  DESC_MAX,
  MAX_IMAGES,
  TITLE_MAX,
  cleanStr,
  parsePrice,
  serviceImage,
  type CategoryId,
  type DeliveryId,
  type Service,
} from "@/lib/services/data";
import { useServices } from "@/contexts/services-context";
import { Overlay } from "./feedback";
import { Button, Card, cx, Field, IconButton, Select, TextArea, TextInput } from "./ui";
import { CategoryIcon, IconImage, IconPlus, IconTrash } from "./icons";

export function CreateService({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Service | null;
  onClose: () => void;
  onSaved: (service: Service | null) => void;
}) {
  const { addService, updateService } = useServices();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryId>("design");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [deliveryId, setDeliveryId] = useState<DeliveryId>("1w");
  const [images, setImages] = useState<string[]>([]);
  const [imgDraft, setImgDraft] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setLastOpen(false);
      return;
    }
    if (lastOpen) return;

    setLastOpen(true);
    if (editing) {
      setTitle(editing.title);
      setCategory(editing.category);
      setDescription(editing.description);
      setPrice(String(editing.price));
      setDeliveryId(editing.deliveryId);
      setImages(editing.images.slice(0, MAX_IMAGES));
    } else {
      setTitle("");
      setCategory("design");
      setDescription("");
      setPrice("");
      setDeliveryId("1w");
      setImages([]);
    }
    setImgDraft("");
    setShowErrors(false);
  }, [open, editing, lastOpen]);

  const titleError = title.trim().length < 3 ? "Give your service a clear title (min 3 characters)." : "";
  const priceValue = parsePrice(price);
  const priceError = priceValue < 1 ? "Minimum listing price is 1 Pi." : "";
  const descError = description.trim().length < 10 ? "Add a short description (min 10 characters)." : "";
  const canSave = !titleError && !priceError && !descError;

  const addImage = () => {
    const clean = cleanStr(imgDraft, 120);
    if (!clean) return;
    setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, clean]));
    setImgDraft("");
  };

  const addUploadedImages = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_IMAGES - images.length)
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const value = typeof reader.result === "string" ? reader.result : "";
          if (value) setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, value]));
        };
        reader.readAsDataURL(file);
      });
  };

  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!canSave) {
      setShowErrors(true);
      return;
    }
    const input = {
      title: title.trim(),
      category,
      description: description.trim(),
      price: priceValue,
      deliveryId,
      images,
    };
    setSaving(true);
    try {
      if (editing) {
        await updateService(editing.id, input);
        onSaved(null);
      } else {
        const svc = await addService(input);
        onSaved(svc);
      }
    } catch (err) {
      console.error("[CreateService] Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay open={open} onClose={onClose} title={editing ? "Edit service" : "Create service"}>
      <div className="mx-auto max-w-md space-y-4 p-4 pb-28">
        <Field label="Title" htmlFor="svc-title" error={showErrors ? titleError : undefined} counter={`${title.length}/${TITLE_MAX}`}>
          <TextInput
            id="svc-title"
            placeholder="e.g. Modern logo design"
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label="Category">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => {
              const activeCat = c.id === category;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cx(
                    "ps-press flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm font-medium",
                    activeCat ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground",
                  )}
                >
                  <CategoryIcon id={c.id} size={18} />
                  <span className="ps-clamp-1">{c.short}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Description"
          htmlFor="svc-desc"
          error={showErrors ? descError : undefined}
          counter={`${description.length}/${DESC_MAX}`}
        >
          <TextArea
            id="svc-desc"
            rows={5}
            maxLength={DESC_MAX}
            placeholder="What's included, terms, and what you need from the customer…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (Pi)" htmlFor="svc-price" error={showErrors ? priceError : undefined}>
            <TextInput
              id="svc-price"
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Delivery time">
            <Select value={deliveryId} onChange={(e) => setDeliveryId(e.target.value as DeliveryId)}>
              {DELIVERY_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={`Portfolio images (${images.length}/${MAX_IMAGES})`} hint="Describe each image and we'll generate a matching placeholder to showcase your work.">
          {images.length > 0 && (
            <div className="mb-2 grid grid-cols-4 gap-2">
              {images.map((q, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary">
                  <img src={q.startsWith("data:image/") ? q : serviceImage(q, 160, 160)} alt="Portfolio example" className="h-full w-full object-cover" />
                  <button
                    aria-label="Remove image"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="ps-press absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {images.length < MAX_IMAGES && (
            <div className="space-y-2">
              <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary-soft px-3 text-sm font-semibold text-primary">
                <IconImage size={16} />
                <span className="ml-2">Upload image</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addUploadedImages(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="flex gap-2">
              <TextInput
                placeholder="e.g. logo on business card"
                value={imgDraft}
                maxLength={120}
                onChange={(e) => setImgDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    addImage();
                  }
                }}
              />
                <IconButton label="Add image" className="h-11 w-11 shrink-0 border border-border bg-card" onClick={addImage}>
                  <IconPlus size={18} />
                </IconButton>
              </div>
            </div>
          )}
          {images.length === 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              <IconImage size={15} />
              Add up to 4 images to showcase your work.
            </div>
          )}
        </Field>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 ps-safe-bottom backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button className="w-full" size="lg" onClick={submit}>
            {editing ? "Save changes" : "Publish service"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
