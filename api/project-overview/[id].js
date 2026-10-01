import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

async function business(uid){
  const {rows}=await db.query("SELECT id,currency,legal_name,trade_name FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(404).json({error:"Business not found"});
  const {rows:p}=await db.query(
    `SELECT p.*,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name,c.email AS customer_email
     FROM projects p LEFT JOIN customers c ON c.id=p.customer_id
     WHERE p.id=$1 AND p.business_id=$2`,[req.params.id,b.id]);
  const project=p[0];if(!project)return res.status(404).json({error:"Project not found"});

  const [{rows:timesheets},{rows:expenses},{rows:invoices}]=await Promise.all([
    db.query(
      `SELECT t.id,t.entry_date,t.description,t.hours::float,t.hourly_rate::float,(t.hours*t.hourly_rate)::float AS value,
              t.billable,t.billed_invoice_id,t.notes,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name
       FROM time_entries t LEFT JOIN customers c ON c.id=t.customer_id
       WHERE t.business_id=$1 AND t.project_id=$2 ORDER BY t.entry_date DESC,t.created_at DESC`,[b.id,project.id]),
    db.query(
      `SELECT e.id,e.expense_date,e.supplier,e.category,e.reference,e.amount::float,e.vat_amount::float,e.billable,e.billed_invoice_id,e.notes
       FROM expenses e WHERE e.business_id=$1 AND e.project_id=$2 ORDER BY e.expense_date DESC,e.created_at DESC`,[b.id,project.id]),
    db.query(
      `SELECT i.id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.currency,i.total::float,i.amount_paid::float,
              i.bad_debt_amount::float,GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)::float AS balance
       FROM invoices i WHERE i.business_id=$1 AND i.project_id=$2 ORDER BY i.invoice_date DESC,i.created_at DESC`,[b.id,project.id])
  ]);

  const issued=invoices.filter(x=>!["draft","cancelled"].includes(x.status));
  const revenue=issued.reduce((s,x)=>s+Number(x.total||0),0);
  const received=issued.reduce((s,x)=>s+Number(x.amount_paid||0),0);
  const outstanding=issued.reduce((s,x)=>s+Number(x.balance||0),0);
  const expenseTotal=expenses.reduce((s,x)=>s+Number(x.amount||0),0);
  const billableExpenses=expenses.filter(x=>x.billable).reduce((s,x)=>s+Number(x.amount||0),0);
  const trackedHours=timesheets.reduce((s,x)=>s+Number(x.hours||0),0);
  const billableHours=timesheets.filter(x=>x.billable).reduce((s,x)=>s+Number(x.hours||0),0);
  const timeValue=timesheets.filter(x=>x.billable).reduce((s,x)=>s+Number(x.value||0),0);
  const margin=revenue-expenseTotal;
  const marginPct=revenue>0?margin/revenue*100:0;

  res.json({
    business:{name:b.trade_name||b.legal_name,currency:b.currency||"AED"},
    project,
    summary:{
      tracked_hours:trackedHours,billable_hours:billableHours,time_value:timeValue,
      expenses:expenseTotal,billable_expenses:billableExpenses,revenue,received,outstanding,
      margin,margin_percent:marginPct,budget:Number(project.budget||0),
      budget_remaining:Number(project.budget||0)-expenseTotal,
      invoices:invoices.length,timesheets:timesheets.length,expense_entries:expenses.length
    },
    timesheets,expenses,invoices
  });
}