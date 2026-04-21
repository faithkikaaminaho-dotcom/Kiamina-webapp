import {
  bulkCreateAccountingRecords,
  createAccountingRecord,
  deleteAccountingRecordById,
  deleteAccountingRecordsByOwner,
  findAccountingRecordById,
  listAccountingRecords,
  monthlyCashflowSummary,
  monthlyProfitLossSummary,
  reassignAccountingRecordsByOwner,
  summarizeAccountingRecords,
  updateAccountingRecordById
} from "../repositories/accounting-records.repository.js";
import { validateCreateRecordPayload } from "../validation/accounting-records.validation.js";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

const RECORD_FIELD_ALIASES = {
  ownerUserId: ["owneruserid", "owner_user_id", "owner", "userid", "user_id"],
  category: ["category", "recordcategory", "record_category"],
  className: ["classname", "class", "class_name", "tag", "group"],
  amount: ["amount", "value", "total", "amount_ngn", "amount_usd"],
  currency: ["currency", "curr", "ccy"],
  transactionType: [
    "transactiontype",
    "transaction_type",
    "type",
    "direction"
  ],
  transactionDate: [
    "transactiondate",
    "transaction_date",
    "date",
    "posteddate",
    "posted_date",
    "valuedate",
    "value_date"
  ],
  description: ["description", "details", "narration", "memo"],
  vendorName: ["vendorname", "vendor", "supplier", "payee"],
  customerName: ["customername", "customer", "client", "payer"],
  paymentMethod: ["paymentmethod", "payment_method", "method", "channel"],
  invoiceNumber: ["invoicenumber", "invoice_number", "invoice", "invoice_no"],
  reference: ["reference", "ref", "reference_no", "reference_number"],
  sourceDocumentId: [
    "sourcedocumentid",
    "source_document_id",
    "documentid",
    "document_id"
  ],
  status: ["status", "recordstatus", "record_status"],
  metadata: ["metadata", "meta", "extra", "attributes"],
  debit: ["debit", "debitamount", "debit_amount", "withdrawal"],
  credit: ["credit", "creditamount", "credit_amount", "deposit"]
};

const normalizeString = (value) => String(value ?? "").trim();

const normalizeSpreadsheetKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const normalizeSpreadsheetRow = (row = {}) => {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeSpreadsheetKey(key);
    if (!normalizedKey) {
      return;
    }
    normalized[normalizedKey] = value;
  });
  return normalized;
};

const normalizeExcelCellValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") {
      return value.text;
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((segment) => segment?.text || "").join("");
    }

    if (value.result !== undefined && value.result !== null) {
      return value.result;
    }

    if (typeof value.hyperlink === "string") {
      return value.hyperlink;
    }
  }

  return value;
};

const parseRowsFromXlsxBuffer = async (fileBuffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = normalizeString(normalizeExcelCellValue(cell.value));
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const maxColumnCount = Math.max(row.cellCount, headers.length - 1);
    const parsedRow = {};
    let hasValues = false;

    for (let columnIndex = 1; columnIndex <= maxColumnCount; columnIndex += 1) {
      const header = normalizeString(headers[columnIndex]);
      if (!header) {
        continue;
      }

      const cellValue = normalizeExcelCellValue(row.getCell(columnIndex).value);
      parsedRow[header] = cellValue;

      if (!hasValues && normalizeString(cellValue) !== "") {
        hasValues = true;
      }
    }

    if (hasValues) {
      rows.push(parsedRow);
    }
  });

  return rows;
};

const parseRowsFromCsvBuffer = (fileBuffer) => {
  const content = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString("utf8") : String(fileBuffer || "");
  if (!content.trim()) {
    return [];
  }

  return parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true
  });
};

const isCsvFileName = (fileName = "") => normalizeString(fileName).toLowerCase().endsWith(".csv");

const createBadRequestError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const parseRowsForImport = async ({ fileBuffer, fileName = "" }) => {
  if (isCsvFileName(fileName)) {
    return parseRowsFromCsvBuffer(fileBuffer);
  }

  try {
    return await parseRowsFromXlsxBuffer(fileBuffer);
  } catch (error) {
    const csvRows = parseRowsFromCsvBuffer(fileBuffer);
    if (csvRows.length > 0) {
      return csvRows;
    }
    throw error;
  }
};

const pickAliasValue = (row = {}, aliases = []) => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value === undefined || value === null) {
      continue;
    }
    const normalized = typeof value === "string" ? value.trim() : value;
    if (normalized === "") {
      continue;
    }
    return normalized;
  }
  return "";
};

const toFiniteNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const normalizeCategoryValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "bank" || normalized === "bankstatement") {
    return "bank-statements";
  }
  if (normalized === "bank statements" || normalized === "bank_statement") {
    return "bank-statements";
  }
  return normalized;
};

const normalizeStatusValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "pending" || normalized === "pending review") {
    return "draft";
  }
  if (normalized === "approved") {
    return "posted";
  }
  if (normalized === "rejected") {
    return "archived";
  }
  return normalized;
};

const normalizeTransactionTypeValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "inflow" || normalized === "income") {
    return "credit";
  }
  if (normalized === "outflow" || normalized === "expense") {
    return "debit";
  }
  return normalized;
};

const parseMetadataValue = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }

  return {};
};

const deriveAmountAndType = ({
  explicitAmount,
  explicitType,
  debitValue,
  creditValue
}) => {
  let amount = explicitAmount;
  let transactionType = explicitType;

  const parsedDebit = toFiniteNumber(debitValue);
  const parsedCredit = toFiniteNumber(creditValue);

  if (amount === null) {
    if (parsedCredit !== null && parsedCredit > 0) {
      amount = Math.abs(parsedCredit);
      if (!transactionType) {
        transactionType = "credit";
      }
    } else if (parsedDebit !== null && parsedDebit > 0) {
      amount = Math.abs(parsedDebit);
      if (!transactionType) {
        transactionType = "debit";
      }
    }
  }

  if (amount !== null && amount < 0) {
    amount = Math.abs(amount);
    if (!transactionType) {
      transactionType = "debit";
    }
  }

  return {
    amount,
    transactionType
  };
};

const buildImportPayloadFromRow = ({
  rawRow = {},
  defaults = {},
  importFileName = "",
  rowNumber = 0
}) => {
  const row = normalizeSpreadsheetRow(rawRow);
  const explicitAmount = toFiniteNumber(
    pickAliasValue(row, RECORD_FIELD_ALIASES.amount)
  );
  const explicitType = normalizeTransactionTypeValue(
    pickAliasValue(row, RECORD_FIELD_ALIASES.transactionType)
  );
  const derived = deriveAmountAndType({
    explicitAmount,
    explicitType,
    debitValue: pickAliasValue(row, RECORD_FIELD_ALIASES.debit),
    creditValue: pickAliasValue(row, RECORD_FIELD_ALIASES.credit)
  });

  const metadata = {
    ...parseMetadataValue(pickAliasValue(row, RECORD_FIELD_ALIASES.metadata)),
    import: {
      source: "bulk-upload",
      fileName: importFileName,
      rowNumber
    }
  };

  return {
    ownerUserId:
      pickAliasValue(row, RECORD_FIELD_ALIASES.ownerUserId) ||
      defaults.ownerUserId ||
      "",
    category:
      normalizeCategoryValue(pickAliasValue(row, RECORD_FIELD_ALIASES.category)) ||
      defaults.category ||
      "",
    className:
      pickAliasValue(row, RECORD_FIELD_ALIASES.className) ||
      defaults.className ||
      "",
    amount: derived.amount,
    currency:
      String(
        pickAliasValue(row, RECORD_FIELD_ALIASES.currency) ||
          defaults.currency ||
          "NGN"
      )
        .trim()
        .toUpperCase(),
    transactionType:
      derived.transactionType ||
      defaults.transactionType ||
      "unknown",
    transactionDate:
      pickAliasValue(row, RECORD_FIELD_ALIASES.transactionDate) ||
      defaults.transactionDate ||
      "",
    description:
      pickAliasValue(row, RECORD_FIELD_ALIASES.description) ||
      defaults.description ||
      "",
    vendorName:
      pickAliasValue(row, RECORD_FIELD_ALIASES.vendorName) ||
      defaults.vendorName ||
      "",
    customerName:
      pickAliasValue(row, RECORD_FIELD_ALIASES.customerName) ||
      defaults.customerName ||
      "",
    paymentMethod:
      pickAliasValue(row, RECORD_FIELD_ALIASES.paymentMethod) ||
      defaults.paymentMethod ||
      "",
    invoiceNumber:
      pickAliasValue(row, RECORD_FIELD_ALIASES.invoiceNumber) ||
      defaults.invoiceNumber ||
      "",
    reference:
      pickAliasValue(row, RECORD_FIELD_ALIASES.reference) ||
      defaults.reference ||
      "",
    sourceDocumentId:
      pickAliasValue(row, RECORD_FIELD_ALIASES.sourceDocumentId) ||
      defaults.sourceDocumentId ||
      "",
    status:
      normalizeStatusValue(pickAliasValue(row, RECORD_FIELD_ALIASES.status)) ||
      defaults.status ||
      "draft",
    metadata
  };
};

export const createRecord = async (payload) => createAccountingRecord(payload);

export const getRecordById = async (id) => findAccountingRecordById(id);

export const updateRecordById = async ({ id, payload }) =>
  updateAccountingRecordById(id, payload);

export const removeRecordById = async (id) => deleteAccountingRecordById(id);

export const removeRecordsByOwner = async (ownerUserId) =>
  deleteAccountingRecordsByOwner(ownerUserId);

export const reassignRecordsByOwner = async ({
  fromOwnerUserId,
  toOwnerUserId
}) =>
  reassignAccountingRecordsByOwner({
    fromOwnerUserId,
    toOwnerUserId
  });

export const getRecords = async (filters) => listAccountingRecords(filters);

export const getRecordsSummary = async (filters) =>
  summarizeAccountingRecords(filters);

export const importRecords = async ({
  fileBuffer,
  fileName = "",
  defaults = {},
  actorUid = "",
  dryRun = false
}) => {
  let rows = [];

  try {
    rows = await parseRowsForImport({
      fileBuffer,
      fileName
    });
  } catch {
    throw createBadRequestError("Unable to parse import file. Upload a valid .xlsx or .csv file.");
  }

  const sanitizedDefaults = {
    ...defaults,
    category: normalizeCategoryValue(defaults.category || ""),
    status: normalizeStatusValue(defaults.status || ""),
    transactionType: normalizeTransactionTypeValue(
      defaults.transactionType || ""
    )
  };

  const errors = [];
  const validPayloads = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const payload = buildImportPayloadFromRow({
      rawRow: row,
      defaults: sanitizedDefaults,
      importFileName: fileName,
      rowNumber
    });

    const { errors: payloadErrors, payload: validatedPayload } =
      validateCreateRecordPayload(payload);

    if (payloadErrors.length > 0) {
      errors.push({
        rowNumber,
        message: payloadErrors.join("; ")
      });
      return;
    }

    validPayloads.push({
      ...validatedPayload,
      createdBy: actorUid || validatedPayload.ownerUserId,
      updatedBy: actorUid || validatedPayload.ownerUserId
    });
  });

  if (dryRun) {
    return {
      totalRows: rows.length,
      importedCount: 0,
      skippedCount: errors.length,
      errors: errors.slice(0, 200),
      items: []
    };
  }

  const createdItems = await bulkCreateAccountingRecords(validPayloads);

  return {
    totalRows: rows.length,
    importedCount: createdItems.length,
    skippedCount: errors.length,
    errors: errors.slice(0, 200),
    items: createdItems
  };
};

export const getMonthlyProfitLoss = async (filters) =>
  monthlyProfitLossSummary(filters);

export const getMonthlyCashflow = async (filters) =>
  monthlyCashflowSummary(filters);
