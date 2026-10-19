export function splitApiError(err, fieldNames) {
  const fieldErrors = {};
  const other = [];
  for (const { field, message } of err.details ?? []) {
    if (!fieldNames.includes(field)) other.push(message);
    else if (!fieldErrors[field]) fieldErrors[field] = message;
  }
  const general = other.length > 0 ? other.join('; ') : Object.keys(fieldErrors).length ? null : err.message;
  return { fieldErrors, general };
}
