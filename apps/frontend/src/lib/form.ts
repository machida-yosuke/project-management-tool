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
