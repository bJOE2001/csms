"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { PRODUCT_IMAGE_ACCEPT, productImageFileError } from "@/lib/menu/image-upload";
import { Button } from "../ui/button";
import { Input } from "../ui/primitives/input";
import { useFormDialog } from "../ui/form-dialog";

export function ProductImageUpload({ value, file, onChange, error }: {
  value: string;
  file: File | null;
  onChange: (url: string, file: File | null) => void;
  error?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useFormDialog();
  const [mode, setMode] = useState("upload");
  const [blob, setBlob] = useState("");
  const [failedPreview, setFailedPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const fileError = file ? productImageFileError(file) : "";
  useEffect(() => {
    if (!file || productImageFileError(file)) { setBlob(""); return; }
    const url = URL.createObjectURL(file);
    setBlob(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const preview = file && !fileError ? blob : value;
  const previewable = preview && preview !== failedPreview && /^(blob:|https:\/\/|\/(?!\/))/.test(preview);
  const change = (url: string, next: File | null) => {
    setMessage("");
    onChange(url, next);
    dialog?.markDirty();
  };
  const select = (next?: File) => { if (next) change(value, next); };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    // A disabled pending form must not accept a drop outside its file control.
    if (input.current?.matches(":disabled")) return;
    if (event.dataTransfer.files.length !== 1) {
      setMessage("Choose one product image at a time.");
      return;
    }
    select(event.dataTransfer.files[0]);
  };
  return (
    <fieldset className="product-image-upload">
      <legend>Product Image</legend>
      <div className="product-image-modes">
        {[{ key: "upload", label: "Upload Image" }, { key: "url", label: "Image URL" }].map(option => (
          <label key={option.key}>
            <input type="radio" name={`${id}-source`} value={option.key} checked={mode === option.key}
              onChange={() => {
                setMode(option.key);
                if (option.key === "url" && file) change(value, null);
              }} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <div className={`product-image-dropzone${dragging ? " is-dragging" : ""}`}
        onDragOver={event => {
          event.preventDefault();
          if (mode === "upload" && !input.current?.matches(":disabled")) setDragging(true);
        }} onDragLeave={() => setDragging(false)} onDrop={mode === "upload" ? drop : event => event.preventDefault()}>
        <div className="product-image-preview">
          {previewable ? (
            // Local object URLs preview a draft only; saved references remain HTTPS/local paths.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Product image preview" width={96} height={96} referrerPolicy="no-referrer"
              onError={() => setFailedPreview(preview)} />
          ) : <ImageIcon size={28} aria-hidden="true" />}
        </div>
        <div className="product-image-upload-details">
          <strong>{file ? file.name : value ? "Current product image" : "Upload a product image"}</strong>
          <p id={`${id}-help`} className="hint">JPG, PNG, or WebP. Maximum 5 MB.</p>
          {mode === "upload" && <div className="product-image-actions">
            <Button variant="outline" onClick={() => input.current?.click()}>
              <Upload size={16} aria-hidden="true" />{file || value ? "Replace Image" : "Choose Image"}
            </Button>
            {(file || value) && <Button variant="outline" onClick={() => {
              change("", null);
              if (input.current) input.current.value = "";
              setMessage("Image removed from this draft. Save the product to apply.");
            }}><X size={16} aria-hidden="true" />Remove Image</Button>}
          </div>}
        </div>
      </div>
      <input ref={input} className="sr-only" type="file" tabIndex={-1} accept={PRODUCT_IMAGE_ACCEPT}
        aria-label="Choose product image" aria-describedby={`${id}-help${fileError ? ` ${id}-file-error` : ""}`}
        aria-invalid={!!fileError || undefined} onChange={event => {
          select(event.target.files?.[0]);
          event.target.value = "";
        }} />
      {mode === "url" && <div className="field product-image-url">
        <label htmlFor={`${id}-url`}>Product image URL</label>
        <Input id={`${id}-url`} name="image_url" value={value} maxLength={2048} placeholder="https://… or /images/…"
          aria-invalid={!!error || undefined} aria-describedby={`${id}-url-help${error ? ` ${id}-url-error` : ""}`}
          onChange={event => change(event.target.value, null)} />
        <small id={`${id}-url-help`} className="hint">Use an existing HTTPS image URL or local image path. Leave blank for a neutral placeholder.</small>
        {value && <Button variant="outline" onClick={() => change("", null)}>Remove Image</Button>}
      </div>}
      {mode === "upload" && <input name="image_url" type="hidden" value={value} />}
      {fileError && <p id={`${id}-file-error`} role="alert" className="form-field-error">{fileError}</p>}
      {error && <p id={`${id}-url-error`} role="alert" className="form-field-error">{error}</p>}
      {message && <p role="status" className="hint">{message}</p>}
    </fieldset>
  );
}
