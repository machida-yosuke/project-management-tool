// The frontend tsconfig has no DOM lib, so narrow the event target structurally.
export function eventValue(event: Event): string {
  const target: unknown = event.target;
  if (
    typeof target === 'object' &&
    target !== null &&
    'value' in target &&
    typeof target.value === 'string'
  ) {
    return target.value;
  }
  throw new Error('Event target has no string value');
}

export function eventFile(event: Event): File | null {
  const target: unknown = event.target;
  if (typeof target === 'object' && target !== null && 'files' in target) {
    const files: unknown = target.files;
    if (typeof files === 'object' && files !== null && 'item' in files) {
      const file: unknown = typeof files.item === 'function' ? files.item(0) : null;
      return file instanceof File ? file : null;
    }
  }
  throw new Error('Event target has no file list');
}
