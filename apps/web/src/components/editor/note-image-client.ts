export async function uploadNoteImage(noteId: string, file: File) {
  const formData = new FormData();
  formData.set("noteId", noteId);
  formData.set("file", file);

  const response = await fetch("/api/uploads/note-image", {
    method: "POST",
    body: formData,
  });

  const data = (await response.json().catch(() => null)) as {
    url?: string;
    error?: string;
  } | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.error ?? "Image upload failed");
  }

  return data.url;
}
