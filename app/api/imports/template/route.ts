import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireOwner } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { generateImportId } from '@/lib/display-ids';
import { SHEET_DEFS, parseTemplate, DATA_START_ROW } from '@/lib/import/template-schema';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(['xlsx', 'xls', 'csv']);

// GET → the blank Domio import template, generated from the same column
// contract (SHEET_DEFS) that the parser reads, so the two can never drift.
export async function GET() {
  const guard = await requireOwner();
  if ('response' in guard) return guard.response;

  const wb = XLSX.utils.book_new();
  for (const def of SHEET_DEFS) {
    const aoa: string[][] = [
      [`Domio Import Template — ${def.sheetName}`],
      ['Fill in one row per record, starting at row 6. Do not change the column order.'],
      ['Columns marked * are required. Dates use YYYY-MM-DD.'],
      [`Example: ${def.example.join(' | ')}`],
      def.headers,
    ];
    // Row 5 holds the headers; the first data row (row 6) is left empty so the
    // example is never imported by accident.
    if (aoa.length !== DATA_START_ROW) {
      throw new Error('Template layout does not match DATA_START_ROW.');
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = def.headers.map((h) => ({ wch: Math.max(16, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, def.sheetName);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Domio_Import_Template.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
}

// POST (multipart "file") → parse the template, store the parsed rows on a new
// ImportJob owned by the caller and return a preview. Nothing is written to the
// real tables until /api/imports/template/confirm.
export async function POST(request: Request) {
  const guard = await requireOwner();
  if ('response' in guard) return guard.response;
  const ownerId = guard.session.user.id;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Please upload the template file.' }, { status: 400 });
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: 'Unsupported file. Upload the Domio template (.xlsx, .xls or .csv).' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 10MB limit.' }, { status: 413 });
  }

  let parsed;
  try {
    parsed = parseTemplate(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error('Template parse failed:', err);
    return NextResponse.json(
      { error: 'Could not read that file. Make sure it is the Domio template.' },
      { status: 400 },
    );
  }

  const { data, counts, warnings, errors } = parsed;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (total === 0 && errors.length === 0) {
    return NextResponse.json(
      { error: 'No data rows were found. Fill in the template starting at row 6.' },
      { status: 400 },
    );
  }

  try {
    const job = await prisma.importJob.create({
      data: {
        displayId: await generateImportId().catch(() => null),
        ownerId,
        importType: 'FIRST_TIME_PROPERTY_LOAD',
        // Files with errors can be previewed but never confirmed.
        status: errors.length > 0 ? 'AWAITING_INPUT' : 'READY_TO_IMPORT',
        originalFileName: file.name.slice(0, 200),
        fileType: ext,
        totalRows: total,
        validRows: errors.length > 0 ? 0 : total,
        warningRows: warnings.length,
        errorRows: errors.length,
        mappedData: data as unknown as object,
      },
      select: { id: true },
    });
    return NextResponse.json({
      jobId: job.id,
      preview: {
        portfolios: counts.portfolios,
        properties: counts.properties,
        units: counts.units,
        tenants: counts.tenants,
        rentRecords: counts.rentPayments,
        warnings,
        errors,
      },
    });
  } catch (err) {
    console.error('Failed to create import job:', err);
    return NextResponse.json({ error: 'Could not save the import. Please try again.' }, { status: 500 });
  }
}
