export function parseUtcIsoInput(value: string): Date {
  if (!/Z$/i.test(value)) {
    throw new Error('Invalid datetime: must be UTC ISO-8601 ending with Z');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid datetime');
  }

  return parsed;
}
