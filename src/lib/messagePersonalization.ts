/** Keep placeholders in the editable draft; resolve only for preview/send. */
export function personalizeMessage(draft: string, name?: string) {
  return draft.replace(/\[NAME\]/g, () => name?.trim() || 'मित्र');
}
