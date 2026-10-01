import { db } from "hatchable";

export const access = "user";
export const methods = ["GET"];

export default async function(req,res){
  const {rows:b}=await db.query(
    "SELECT id,currency,legal_name FROM businesses WHERE owner_user_id=$1 LIMIT 1",
    [req.user.id]
  );
  const business=b[0]||null;
  const nowYear=new Date().getUTCFullYear();
  const requested=Number(req.query&&req.query.year);
  const year=Number.isInteger(requested)&&requested>=2000&&requested<=2100?requested:nowYear;

  if(!business) return res.json({
    business:null,
    metrics:{invoiced:0,paid:0,outstanding:0,overdue:0,invoices:0,customers:0},
    receivables:{total:0,current:0,overdue_total:0,days_1_15:0,days_16_30:0,days_31_45:0,above_45:0},
    fiscal:{year,months:[],totals:{sales:0,receipts:0,expenses:0}},
    recent:[]
  });

  const {rows:m}=await db.query(
    `SELECT
      COALESCE(SUM(CASE WHEN status NOT IN ('draft','cancelled') THEN total ELSE 0 END),0)::float AS invoiced,
      COALESCE(SUM(CASE WHEN status NOT IN ('draft','cancelled') THEN amount_paid ELSE 0 END),0)::float AS paid,
      COALESCE(SUM(CASE WHEN status NOT IN ('draft','cancelled') THEN GREATEST(total-amount_paid-bad_debt_amount,0) ELSE 0 END),0)::float AS outstanding,
      COALESCE(SUM(CASE WHEN status NOT IN ('draft','cancelled') AND due_date<CURRENT_DATE AND total>amount_paid+bad_debt_amount THEN total-amount_paid-bad_debt_amount ELSE 0 END),0)::float AS overdue,
      COUNT(*)::int AS invoices
     FROM invoices WHERE business_id=$1`,
    [business.id]
  );

  const {rows:aging}=await db.query(
    `SELECT
      COALESCE(SUM(balance),0)::float AS total,
      COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date>=CURRENT_DATE THEN balance ELSE 0 END),0)::float AS current,
      COALESCE(SUM(CASE WHEN due_date<CURRENT_DATE THEN balance ELSE 0 END),0)::float AS overdue_total,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date BETWEEN 1 AND 15 THEN balance ELSE 0 END),0)::float AS days_1_15,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date BETWEEN 16 AND 30 THEN balance ELSE 0 END),0)::float AS days_16_30,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date BETWEEN 31 AND 45 THEN balance ELSE 0 END),0)::float AS days_31_45,
      COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date>45 THEN balance ELSE 0 END),0)::float AS above_45
     FROM (
       SELECT due_date,GREATEST(total-amount_paid-bad_debt_amount,0) AS balance
       FROM invoices
       WHERE business_id=$1
         AND status NOT IN ('draft','cancelled')
         AND total>amount_paid+bad_debt_amount
     ) r`,
    [business.id]
  );

  const {rows:c}=await db.query(
    "SELECT COUNT(*)::int AS customers FROM customers WHERE business_id=$1",
    [business.id]
  );

  const {rows:sales}=await db.query(
    `SELECT EXTRACT(MONTH FROM invoice_date)::int AS month,COALESCE(SUM(total),0)::float AS amount
     FROM invoices
     WHERE business_id=$1 AND status NOT IN ('draft','cancelled')
       AND invoice_date>=$2::date AND invoice_date<($2::date + interval '1 year')
     GROUP BY EXTRACT(MONTH FROM invoice_date)`,
    [business.id,`${year}-01-01`]
  );

  const {rows:receipts}=await db.query(
    `SELECT month,COALESCE(SUM(amount),0)::float AS amount FROM (
       SELECT EXTRACT(MONTH FROM payment_date)::int AS month,amount::float AS amount
       FROM payments WHERE business_id=$1
         AND payment_date>=$2::date AND payment_date<($2::date + interval '1 year')
       UNION ALL
       SELECT EXTRACT(MONTH FROM refund_date)::int AS month,-amount::float AS amount
       FROM refunds WHERE business_id=$1
         AND refund_date>=$2::date AND refund_date<($2::date + interval '1 year')
     ) x GROUP BY month`,
    [business.id,`${year}-01-01`]
  );

  const {rows:expenses}=await db.query(
    `SELECT month,COALESCE(SUM(amount),0)::float AS amount FROM (
       SELECT EXTRACT(MONTH FROM expense_date)::int AS month,amount::float AS amount
       FROM expenses WHERE business_id=$1
         AND expense_date>=$2::date AND expense_date<($2::date + interval '1 year')
       UNION ALL
       SELECT EXTRACT(MONTH FROM charge_date)::int AS month,amount::float AS amount
       FROM bank_charges WHERE business_id=$1
         AND charge_date>=$2::date AND charge_date<($2::date + interval '1 year')
     ) x GROUP BY month`,
    [business.id,`${year}-01-01`]
  );

  const salesMap=Object.fromEntries(sales.map(x=>[x.month,Number(x.amount)||0]));
  const receiptMap=Object.fromEntries(receipts.map(x=>[x.month,Number(x.amount)||0]));
  const expenseMap=Object.fromEntries(expenses.map(x=>[x.month,Number(x.amount)||0]));
  const months=Array.from({length:12},(_,i)=>({
    month:i+1,
    sales:salesMap[i+1]||0,
    receipts:receiptMap[i+1]||0,
    expenses:expenseMap[i+1]||0
  }));
  const totals=months.reduce((a,x)=>({
    sales:a.sales+x.sales,
    receipts:a.receipts+x.receipts,
    expenses:a.expenses+x.expenses
  }),{sales:0,receipts:0,expenses:0});

  const {rows:recent}=await db.query(
    `SELECT i.id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.total,i.amount_paid,
            COALESCE(c.company,c.name,'—') AS customer_name
     FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
     WHERE i.business_id=$1 ORDER BY i.created_at DESC LIMIT 8`,
    [business.id]
  );

  res.json({
    business,
    metrics:{...m[0],customers:c[0].customers},
    receivables:aging[0],
    fiscal:{year,months,totals},
    recent
  });
}