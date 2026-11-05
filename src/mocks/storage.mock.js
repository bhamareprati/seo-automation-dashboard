// Added to the spec's mocks. The spec replaces Cloudflare R2 with a local reports folder.
const fs = require('node:fs/promises');
const path = require('node:path');

async function saveReportFile(reportsDir, auditId, bytes) {
  await fs.mkdir(reportsDir, { recursive: true });
  const pdfPath = path.join(reportsDir, `${auditId}.pdf`);
  await fs.writeFile(pdfPath, bytes);
  return pdfPath;
}

module.exports = { saveReportFile };
