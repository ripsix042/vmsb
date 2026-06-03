/**
 * Escape CSV cell values and neutralise spreadsheet formula injection.
 */
function csvSafe(value) {
  if (value == null) return '';
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=\-+@]/.test(s)) s = `'${s}`;
  return s.replace(/"/g, '""');
}

function csvRow(values) {
  return values.map((v) => `"${csvSafe(v)}"`).join(',');
}

module.exports = { csvSafe, csvRow };
