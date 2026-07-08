import { randomBytes } from "node:crypto";

const SUPPORTED_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_NOTE_IMAGE_BYTES = 8 * 1024 * 1024;

interface NoteImagePathInput {
  noteId: string;
  contentType: string;
  now?: Date;
  randomId?: string;
}

interface NoteImageUploadInput {
  noteId: string;
  file: File;
  upload: (
    file: Uint8Array,
    path: string,
    contentType: string,
  ) => Promise<{ path: string; url: string }>;
  now?: Date;
  randomId?: () => string;
}

export function extensionForImageType(contentType: string) {
  return SUPPORTED_IMAGE_EXTENSIONS[contentType.toLowerCase()] ?? null;
}

export function buildNoteImageObjectPath({
  noteId,
  contentType,
  now = new Date(),
  randomId = randomNoteImageId(),
}: NoteImagePathInput) {
  const extension = extensionForImageType(contentType);
  if (!extension) throw new Error("Unsupported image type");

  const safeNoteId = noteId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const time = [
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join("");

  return `notes/${safeNoteId}/${year}/${month}/${day}/${time}-${randomId}.${extension}`;
}

export async function uploadNoteImageFile({
  noteId,
  file,
  upload,
  now = new Date(),
  randomId = randomNoteImageId,
}: NoteImageUploadInput) {
  const contentType = file.type.toLowerCase();
  if (!extensionForImageType(contentType)) throw new Error("Unsupported image type");
  if (file.size > MAX_NOTE_IMAGE_BYTES) throw new Error("Image is too large");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = buildNoteImageObjectPath({
    noteId,
    contentType,
    now,
    randomId: randomId(),
  });

  return upload(bytes, path, contentType);
}

function randomNoteImageId() {
  return randomBytes(8).toString("hex");
}
