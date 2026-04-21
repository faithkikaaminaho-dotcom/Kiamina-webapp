import { AccountingRecord } from "../models/AccountingRecord.model.js";

const escapeRegex = (value = "") =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSearchFilter = (searchTerm) => {
  const normalized = String(searchTerm || "").trim();
  if (!normalized) {
    return null;
  }

  const regex = new RegExp(escapeRegex(normalized), "i");
  return {
    $or: [
      { description: regex },
      { vendorName: regex },
      { customerName: regex },
      { invoiceNumber: regex },
      { reference: regex },
      { className: regex }
    ]
  };
};

const buildMatchQuery = ({ ownerUserId, category, status, dateFrom, dateTo }) => {
  const match = {};

  if (ownerUserId) {
    match.ownerUserId = ownerUserId;
  }
  if (category) {
    match.category = category;
  }
  if (status) {
    match.status = status;
  }
  if (dateFrom || dateTo) {
    match.transactionDate = {};
    if (dateFrom) {
      match.transactionDate.$gte = dateFrom;
    }
    if (dateTo) {
      match.transactionDate.$lte = dateTo;
    }
  }

  return match;
};

const buildIncomeCondition = () => ({
  $or: [
    { $eq: ["$category", "sales"] },
    {
      $and: [
        { $eq: ["$category", "other"] },
        { $eq: ["$transactionType", "credit"] }
      ]
    }
  ]
});

const buildExpenseCondition = () => ({
  $or: [
    { $eq: ["$category", "expenses"] },
    {
      $and: [
        { $eq: ["$category", "other"] },
        { $eq: ["$transactionType", "debit"] }
      ]
    }
  ]
});

const buildInflowCondition = () => ({
  $or: [
    { $eq: ["$transactionType", "credit"] },
    {
      $and: [
        { $eq: ["$transactionType", "unknown"] },
        { $eq: ["$category", "sales"] }
      ]
    }
  ]
});

const buildOutflowCondition = () => ({
  $or: [
    { $eq: ["$transactionType", "debit"] },
    {
      $and: [
        { $eq: ["$transactionType", "unknown"] },
        { $eq: ["$category", "expenses"] }
      ]
    }
  ]
});

export const createAccountingRecord = async (payload) =>
  AccountingRecord.create(payload);

export const bulkCreateAccountingRecords = async (payloads = []) => {
  const safePayloads = Array.isArray(payloads) ? payloads : [];
  if (safePayloads.length === 0) {
    return [];
  }

  return AccountingRecord.insertMany(safePayloads, {
    ordered: true
  });
};

export const findAccountingRecordById = async (id) => AccountingRecord.findById(id);

export const updateAccountingRecordById = async (id, payload) =>
  AccountingRecord.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true
  });

export const deleteAccountingRecordById = async (id) =>
  AccountingRecord.findByIdAndDelete(id);

export const deleteAccountingRecordsByOwner = async (ownerUserId) =>
  AccountingRecord.deleteMany({ ownerUserId });

export const reassignAccountingRecordsByOwner = async ({
  fromOwnerUserId,
  toOwnerUserId
}) =>
  AccountingRecord.updateMany(
    { ownerUserId: String(fromOwnerUserId || "").trim() },
    {
      $set: {
        ownerUserId: String(toOwnerUserId || "").trim()
      }
    }
  );

export const listAccountingRecords = async ({
  ownerUserId,
  category,
  status,
  className,
  dateFrom,
  dateTo,
  search,
  limit = 50,
  skip = 0
}) => {
  const query = buildMatchQuery({ ownerUserId, category, status, dateFrom, dateTo });

  if (className) {
    query.className = className;
  }

  const searchFilter = buildSearchFilter(search);
  if (searchFilter) {
    Object.assign(query, searchFilter);
  }

  const [items, total] = await Promise.all([
    AccountingRecord.find(query)
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(Math.max(0, skip))
      .limit(Math.max(1, limit)),
    AccountingRecord.countDocuments(query)
  ]);

  return {
    items,
    total
  };
};

export const summarizeAccountingRecords = async ({
  ownerUserId,
  category,
  status,
  dateFrom,
  dateTo
}) => {
  const match = buildMatchQuery({ ownerUserId, category, status, dateFrom, dateTo });

  const [overall] = await AccountingRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        totalAmount: { $sum: "$amount" }
      }
    }
  ]);

  const byCategory = await AccountingRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        amount: { $sum: "$amount" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return {
    totalCount: overall?.totalCount || 0,
    totalAmount: overall?.totalAmount || 0,
    byCategory: byCategory.map((item) => ({
      category: item._id,
      count: item.count,
      amount: item.amount
    }))
  };
};

export const monthlyProfitLossSummary = async ({
  ownerUserId,
  category,
  status,
  dateFrom,
  dateTo,
  timezone = "UTC"
}) => {
  const match = buildMatchQuery({ ownerUserId, category, status, dateFrom, dateTo });
  const monthExpression = {
    $dateToString: {
      format: "%Y-%m",
      date: "$transactionDate",
      timezone
    }
  };

  const rows = await AccountingRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: monthExpression,
        income: {
          $sum: {
            $cond: [buildIncomeCondition(), "$amount", 0]
          }
        },
        expenses: {
          $sum: {
            $cond: [buildExpenseCondition(), "$amount", 0]
          }
        },
        recordsCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const monthly = rows.map((row) => {
    const income = Number(row?.income || 0);
    const expenses = Number(row?.expenses || 0);
    const grossProfit = income - expenses;
    return {
      month: row?._id || "",
      income,
      expenses,
      grossProfit,
      netProfit: grossProfit,
      recordsCount: Number(row?.recordsCount || 0)
    };
  });

  const totals = monthly.reduce(
    (accumulator, row) => ({
      income: accumulator.income + row.income,
      expenses: accumulator.expenses + row.expenses,
      grossProfit: accumulator.grossProfit + row.grossProfit,
      netProfit: accumulator.netProfit + row.netProfit,
      recordsCount: accumulator.recordsCount + row.recordsCount
    }),
    {
      income: 0,
      expenses: 0,
      grossProfit: 0,
      netProfit: 0,
      recordsCount: 0
    }
  );

  return {
    totals,
    monthly
  };
};

export const monthlyCashflowSummary = async ({
  ownerUserId,
  category,
  status,
  dateFrom,
  dateTo,
  timezone = "UTC"
}) => {
  const match = buildMatchQuery({ ownerUserId, category, status, dateFrom, dateTo });
  const monthExpression = {
    $dateToString: {
      format: "%Y-%m",
      date: "$transactionDate",
      timezone
    }
  };

  const rows = await AccountingRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: monthExpression,
        inflow: {
          $sum: {
            $cond: [buildInflowCondition(), "$amount", 0]
          }
        },
        outflow: {
          $sum: {
            $cond: [buildOutflowCondition(), "$amount", 0]
          }
        },
        recordsCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const monthly = rows.map((row) => {
    const inflow = Number(row?.inflow || 0);
    const outflow = Number(row?.outflow || 0);
    return {
      month: row?._id || "",
      inflow,
      outflow,
      netCashflow: inflow - outflow,
      recordsCount: Number(row?.recordsCount || 0)
    };
  });

  const totals = monthly.reduce(
    (accumulator, row) => ({
      inflow: accumulator.inflow + row.inflow,
      outflow: accumulator.outflow + row.outflow,
      netCashflow: accumulator.netCashflow + row.netCashflow,
      recordsCount: accumulator.recordsCount + row.recordsCount
    }),
    {
      inflow: 0,
      outflow: 0,
      netCashflow: 0,
      recordsCount: 0
    }
  );

  return {
    totals,
    monthly
  };
};
