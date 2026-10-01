import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):null;
const clampReport=v=>String(v||"").replace(/[^a-z0-9_]/g,"").slice(0,80);

async function business(uid){
  const {rows}=await db.query("SELECT id,currency,legal_name,trade_name FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
function report(title,columns,rows,summary={},note=null){return{available:true,title,columns,rows,summary,note}}
function unavailable(title,reason){return{available:false,title,reason,columns:[],rows:[],summary:{}}}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(400).json({error:"Complete business setup first"});
  const q=req.query||{},key=clampReport(q.report),from=validDate(q.from),to=validDate(q.to),currency=b.currency||"AED";
  const period=(field,params)=>{
    let sql="";
    if(from){params.push(from);sql+=` AND ${field}>=$${params.length}`}
    if(to){params.push(to);sql+=` AND ${field}<=$${params.length}`}
    return sql;
  };

  try{
    if(key==="sales_by_customer"){
      const params=[b.id];const p=period("i.invoice_date",params);
      const {rows}=await db.query(
        `SELECT COALESCE(c.company,c.display_name_primary,c.name,'Unassigned') AS customer,
                COUNT(i.id)::int AS invoices,COALESCE(SUM(i.total),0)::float AS sales,
                COALESCE(SUM(i.amount_paid),0)::float AS received,
                COALESCE(SUM(GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)),0)::float AS balance
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
         WHERE i.business_id=$1 AND i.status NOT IN ('draft','cancelled') ${p}
         GROUP BY COALESCE(c.company,c.display_name_primary,c.name,'Unassigned')
         ORDER BY sales DESC`,params);
      return res.json(report("Sales by Customer",
        [{key:"customer",label:"Customer"},{key:"invoices",label:"Invoices"},{key:"sales",label:"Sales",money:true},{key:"received",label:"Received",money:true},{key:"balance",label:"Balance",money:true}],
        rows,{total_sales:rows.reduce((s,x)=>s+Number(x.sales||0),0),currency}));
    }

    if(key==="sales_by_item"){
      const params=[b.id];const p=period("i.invoice_date",params);
      const {rows}=await db.query(
        `SELECT ii.item_name AS item,COALESCE(ii.unit,'') AS unit,
                COALESCE(SUM(ii.quantity),0)::float AS quantity,
                COALESCE(SUM(ii.line_subtotal),0)::float AS net_sales,
                COALESCE(SUM(ii.line_tax),0)::float AS vat,
                COALESCE(SUM(ii.line_total),0)::float AS total
         FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
         WHERE i.business_id=$1 AND i.status NOT IN ('draft','cancelled') ${p}
         GROUP BY ii.item_name,COALESCE(ii.unit,'') ORDER BY total DESC`,params);
      return res.json(report("Sales by Item",
        [{key:"item",label:"Item"},{key:"unit",label:"Unit"},{key:"quantity",label:"Qty"},{key:"net_sales",label:"Net Sales",money:true},{key:"vat",label:"VAT",money:true},{key:"total",label:"Total",money:true}],
        rows,{total_sales:rows.reduce((s,x)=>s+Number(x.total||0),0),currency}));
    }

    if(key==="sales_by_salesperson"){
      const params=[b.id];const p=period("i.invoice_date",params);
      const {rows}=await db.query(
        `SELECT COALESCE(NULLIF(TRIM(i.salesperson_name),''),'Unassigned') AS salesperson,
                COUNT(*)::int AS invoices,COALESCE(SUM(i.total),0)::float AS sales,
                COALESCE(SUM(i.amount_paid),0)::float AS received,
                COALESCE(SUM(GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)),0)::float AS balance
         FROM invoices i WHERE i.business_id=$1 AND i.status NOT IN ('draft','cancelled') ${p}
         GROUP BY COALESCE(NULLIF(TRIM(i.salesperson_name),''),'Unassigned') ORDER BY sales DESC`,params);
      return res.json(report("Sales by Salesperson",
        [{key:"salesperson",label:"Salesperson"},{key:"invoices",label:"Invoices"},{key:"sales",label:"Sales",money:true},{key:"received",label:"Received",money:true},{key:"balance",label:"Balance",money:true}],
        rows,{total_sales:rows.reduce((s,x)=>s+Number(x.sales||0),0),currency}));
    }

    if(key==="ar_aging_summary"){
      const {rows}=await db.query(
        `SELECT
          COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date>=CURRENT_DATE THEN balance ELSE 0 END),0)::float AS current,
          COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date BETWEEN 1 AND 15 THEN balance ELSE 0 END),0)::float AS days_1_15,
          COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date BETWEEN 16 AND 30 THEN balance ELSE 0 END),0)::float AS days_16_30,
          COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date BETWEEN 31 AND 45 THEN balance ELSE 0 END),0)::float AS days_31_45,
          COALESCE(SUM(CASE WHEN CURRENT_DATE-due_date>45 THEN balance ELSE 0 END),0)::float AS above_45
         FROM (SELECT due_date,GREATEST(total-amount_paid-bad_debt_amount,0) AS balance FROM invoices
               WHERE business_id=$1 AND status NOT IN ('draft','cancelled') AND total>amount_paid+bad_debt_amount+bad_debt_amount) x`,[b.id]);
      const x=rows[0],out=[
        {bucket:"Current",amount:x.current},{bucket:"1–15 Days",amount:x.days_1_15},{bucket:"16–30 Days",amount:x.days_16_30},
        {bucket:"31–45 Days",amount:x.days_31_45},{bucket:"Above 45 Days",amount:x.above_45}
      ];
      return res.json(report("AR Aging Summary",
        [{key:"bucket",label:"Aging Bucket"},{key:"amount",label:"Amount",money:true}],out,
        {total:out.reduce((s,a)=>s+Number(a.amount||0),0),currency}));
    }

    if(key==="ar_aging_details"||key==="receivable_details"){
      const {rows}=await db.query(
        `SELECT i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                i.invoice_date,i.due_date,i.currency,i.total::float,i.amount_paid::float,
                GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)::float AS balance,
                CASE WHEN i.due_date IS NULL OR i.due_date>=CURRENT_DATE THEN 0 ELSE CURRENT_DATE-i.due_date END AS days_overdue,
                CASE WHEN i.due_date IS NULL OR i.due_date>=CURRENT_DATE THEN 'Current'
                     WHEN CURRENT_DATE-i.due_date BETWEEN 1 AND 15 THEN '1–15 Days'
                     WHEN CURRENT_DATE-i.due_date BETWEEN 16 AND 30 THEN '16–30 Days'
                     WHEN CURRENT_DATE-i.due_date BETWEEN 31 AND 45 THEN '31–45 Days'
                     ELSE 'Above 45 Days' END AS aging_bucket
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
         WHERE i.business_id=$1 AND i.status NOT IN ('draft','cancelled') AND i.total>i.amount_paid
         ORDER BY i.due_date NULLS LAST,i.invoice_date`,[b.id]);
      return res.json(report(key==="ar_aging_details"?"AR Aging Details":"Receivable Details",
        [{key:"invoice_number",label:"Invoice"},{key:"customer",label:"Customer"},{key:"invoice_date",label:"Invoice Date",date:true},{key:"due_date",label:"Due Date",date:true},{key:"aging_bucket",label:"Aging"},{key:"days_overdue",label:"Days Overdue"},{key:"balance",label:"Balance",money:true}],
        rows,{total_receivable:rows.reduce((s,x)=>s+Number(x.balance||0),0),currency}));
    }

    if(key==="invoice_details"){
      const params=[b.id];const p=period("i.invoice_date",params);
      const {rows}=await db.query(
        `SELECT i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                i.invoice_date,i.due_date,i.status,i.salesperson_name,i.currency,
                i.subtotal::float,i.discount_amount::float,i.vat_amount::float,i.total::float,i.amount_paid::float,
                GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)::float AS balance
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
         WHERE i.business_id=$1 ${p} ORDER BY i.invoice_date DESC,i.created_at DESC`,params);
      return res.json(report("Invoice Details",
        [{key:"invoice_number",label:"Invoice"},{key:"customer",label:"Customer"},{key:"invoice_date",label:"Date",date:true},{key:"due_date",label:"Due",date:true},{key:"status",label:"Status"},{key:"salesperson_name",label:"Salesperson"},{key:"subtotal",label:"Subtotal",money:true},{key:"discount_amount",label:"Discount",money:true},{key:"vat_amount",label:"VAT",money:true},{key:"total",label:"Total",money:true},{key:"amount_paid",label:"Paid",money:true},{key:"balance",label:"Balance",money:true}],
        rows,{count:rows.length,currency}));
    }

    if(key==="quote_details"){
      const params=[b.id];const p=period("q.quote_date",params);
      const {rows}=await db.query(
        `SELECT q.quote_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                q.quote_date,q.expiry_date,q.status,q.currency,q.subtotal::float,q.discount_amount::float,q.vat_amount::float,q.total::float,
                CASE WHEN q.converted_invoice_id IS NULL THEN 'No' ELSE 'Yes' END AS converted
         FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
         WHERE q.business_id=$1 ${p} ORDER BY q.quote_date DESC,q.created_at DESC`,params);
      return res.json(report("Quote Details",
        [{key:"quote_number",label:"Quote"},{key:"customer",label:"Customer"},{key:"quote_date",label:"Date",date:true},{key:"expiry_date",label:"Expiry",date:true},{key:"status",label:"Status"},{key:"subtotal",label:"Subtotal",money:true},{key:"vat_amount",label:"VAT",money:true},{key:"total",label:"Total",money:true},{key:"converted",label:"Converted"}],
        rows,{count:rows.length,currency}));
    }

    if(key==="quote_item_details"){
      const params=[b.id];const p=period("q.quote_date",params);
      const {rows}=await db.query(
        `SELECT q.quote_number,q.quote_date,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                qi.item_name,qi.quantity::float,qi.unit,qi.rate::float,qi.discount_percent::float,qi.tax_rate::float,
                qi.line_subtotal::float,qi.line_tax::float,qi.line_total::float
         FROM quote_items qi JOIN quotes q ON q.id=qi.quote_id LEFT JOIN customers c ON c.id=q.customer_id
         WHERE q.business_id=$1 ${p} ORDER BY q.quote_date DESC,q.quote_number,qi.position`,params);
      return res.json(report("Quote Item Details",
        [{key:"quote_number",label:"Quote"},{key:"quote_date",label:"Date",date:true},{key:"customer",label:"Customer"},{key:"item_name",label:"Item"},{key:"quantity",label:"Qty"},{key:"unit",label:"Unit"},{key:"rate",label:"Rate",money:true},{key:"discount_percent",label:"Discount %"},{key:"tax_rate",label:"VAT %"},{key:"line_total",label:"Total",money:true}],rows,{count:rows.length,currency}));
    }

    if(key==="customer_balance_summary"){
      const {rows}=await db.query(
        `SELECT COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                COUNT(i.id)::int AS invoices,COALESCE(SUM(i.total),0)::float AS invoiced,
                COALESCE(SUM(i.amount_paid),0)::float AS paid,
                COALESCE(SUM(GREATEST(i.total-i.amount_paid,0)),0)::float AS balance
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
         WHERE i.business_id=$1 AND i.status NOT IN ('draft','cancelled')
         GROUP BY COALESCE(c.company,c.display_name_primary,c.name,'—')
         HAVING COALESCE(SUM(GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)),0)>0
         ORDER BY balance DESC`,[b.id]);
      return res.json(report("Customer Balance Summary",
        [{key:"customer",label:"Customer"},{key:"invoices",label:"Invoices"},{key:"invoiced",label:"Invoiced",money:true},{key:"paid",label:"Paid",money:true},{key:"balance",label:"Balance",money:true}],
        rows,{total_balance:rows.reduce((s,x)=>s+Number(x.balance||0),0),currency}));
    }

    if(key==="receivable_summary"){
      const {rows}=await db.query(
        `SELECT COUNT(*)::int AS open_invoices,
                COALESCE(SUM(GREATEST(total-amount_paid-bad_debt_amount,0)),0)::float AS receivable,
                COALESCE(SUM(CASE WHEN due_date<CURRENT_DATE THEN GREATEST(total-amount_paid-bad_debt_amount,0) ELSE 0 END),0)::float AS overdue
         FROM invoices WHERE business_id=$1 AND status NOT IN ('draft','cancelled') AND total>amount_paid`,[b.id]);
      const x=rows[0],out=[
        {metric:"Open invoices",value:x.open_invoices,type:"count"},
        {metric:"Total receivable",value:x.receivable,type:"money"},
        {metric:"Overdue receivable",value:x.overdue,type:"money"},
        {metric:"Current receivable",value:Number(x.receivable)-Number(x.overdue),type:"money"}
      ];
      return res.json(report("Receivable Summary",
        [{key:"metric",label:"Metric"},{key:"value",label:"Value",mixed:true}],out,{currency}));
    }

    if(key==="payments_received"){
      const params=[b.id];const p=period("p.payment_date",params);
      const {rows}=await db.query(
        `SELECT p.payment_date,i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                p.method,p.reference,p.amount::float,i.currency,p.notes
         FROM payments p JOIN invoices i ON i.id=p.invoice_id LEFT JOIN customers c ON c.id=i.customer_id
         WHERE p.business_id=$1 ${p} ORDER BY p.payment_date DESC,p.created_at DESC`,params);
      return res.json(report("Payments Received",
        [{key:"payment_date",label:"Date",date:true},{key:"customer",label:"Customer"},{key:"invoice_number",label:"Invoice"},{key:"method",label:"Method"},{key:"reference",label:"Reference"},{key:"amount",label:"Amount",money:true},{key:"notes",label:"Notes"}],
        rows,{total_received:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="time_to_get_paid"){
      const {rows}=await db.query(
        `SELECT i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,i.invoice_date,
                MIN(p.payment_date) AS first_payment_date,MAX(p.payment_date) AS last_payment_date,
                CASE WHEN MIN(p.payment_date) IS NULL THEN NULL ELSE MIN(p.payment_date)-i.invoice_date END AS days_to_first_payment,
                CASE WHEN MAX(p.payment_date) IS NULL THEN NULL ELSE MAX(p.payment_date)-i.invoice_date END AS days_to_last_payment,
                COALESCE(SUM(p.amount),0)::float AS received,i.total::float AS invoice_total
         FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN payments p ON p.invoice_id=i.id
         WHERE i.business_id=$1 AND i.status NOT IN ('draft','cancelled')
         GROUP BY i.id,i.invoice_number,c.company,c.display_name_primary,c.name,i.invoice_date,i.total
         ORDER BY i.invoice_date DESC`,[b.id]);
      const paid=rows.filter(x=>x.days_to_first_payment!==null);
      const avg=paid.length?paid.reduce((s,x)=>s+Number(x.days_to_first_payment||0),0)/paid.length:0;
      return res.json(report("Time to Get Paid",
        [{key:"invoice_number",label:"Invoice"},{key:"customer",label:"Customer"},{key:"invoice_date",label:"Invoice Date",date:true},{key:"first_payment_date",label:"First Payment",date:true},{key:"days_to_first_payment",label:"Days to First Payment"},{key:"days_to_last_payment",label:"Days to Last Payment"},{key:"received",label:"Received",money:true},{key:"invoice_total",label:"Invoice Total",money:true}],
        rows,{average_days_to_first_payment:Math.round(avg*10)/10,currency}));
    }

    if(key==="expense_details"){
      const params=[b.id];const p=period("expense_date",params);
      const {rows}=await db.query(
        `SELECT expense_date,supplier,category,reference,amount::float,vat_amount::float,
                (amount-vat_amount)::float AS net_before_vat,notes
         FROM expenses WHERE business_id=$1 ${p} ORDER BY expense_date DESC,created_at DESC`,params);
      return res.json(report("Expense Details",
        [{key:"expense_date",label:"Date",date:true},{key:"supplier",label:"Supplier"},{key:"category",label:"Category"},{key:"reference",label:"Reference"},{key:"net_before_vat",label:"Net",money:true},{key:"vat_amount",label:"VAT",money:true},{key:"amount",label:"Amount",money:true},{key:"notes",label:"Notes"}],
        rows,{total_expenses:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="expenses_by_category"){
      const params=[b.id];const p=period("expense_date",params);
      const {rows}=await db.query(
        `SELECT COALESCE(category,'Uncategorized') AS category,COUNT(*)::int AS entries,
                COALESCE(SUM(amount),0)::float AS amount,COALESCE(SUM(vat_amount),0)::float AS vat
         FROM expenses WHERE business_id=$1 ${p}
         GROUP BY COALESCE(category,'Uncategorized') ORDER BY amount DESC`,params);
      return res.json(report("Expenses by Category",
        [{key:"category",label:"Category"},{key:"entries",label:"Entries"},{key:"amount",label:"Amount",money:true},{key:"vat",label:"VAT",money:true}],
        rows,{total_expenses:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="timesheet_details"){
      const params=[b.id];const p=period("t.entry_date",params);
      const {rows}=await db.query(
        `SELECT t.entry_date,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,t.description,
                t.hours::float,t.hourly_rate::float,(t.hours*t.hourly_rate)::float AS value,t.billable,
                CASE WHEN t.billed_invoice_id IS NULL THEN 'Unbilled' ELSE 'Billed' END AS billing_status
         FROM time_entries t LEFT JOIN customers c ON c.id=t.customer_id
         WHERE t.business_id=$1 ${p} ORDER BY t.entry_date DESC,t.created_at DESC`,params);
      return res.json(report("Timesheet Details",
        [{key:"entry_date",label:"Date",date:true},{key:"customer",label:"Customer"},{key:"description",label:"Description"},{key:"hours",label:"Hours"},{key:"hourly_rate",label:"Hourly Rate",money:true},{key:"value",label:"Value",money:true},{key:"billable",label:"Billable",bool:true},{key:"billing_status",label:"Billing Status"}],
        rows,{total_hours:rows.reduce((s,x)=>s+Number(x.hours||0),0),total_value:rows.reduce((s,x)=>s+Number(x.value||0),0),currency}));
    }

    if(key==="system_mails"){
      const {rows}=await db.query(
        `SELECT de.created_at,de.recipient,de.metadata->>'subject' AS subject,i.invoice_number
         FROM document_events de LEFT JOIN invoices i ON i.id=de.invoice_id
         WHERE de.business_id=$1 AND de.event_type='emailed'
         ORDER BY de.created_at DESC LIMIT 500`,[b.id]);
      return res.json(report("System Mails",
        [{key:"created_at",label:"Sent At",datetime:true},{key:"recipient",label:"Recipient"},{key:"subject",label:"Subject"},{key:"invoice_number",label:"Invoice"}],rows,{count:rows.length}));
    }

    if(key==="activity_logs"){
      const {rows}=await db.query(
        `SELECT de.created_at,de.event_type,de.recipient,i.invoice_number,de.metadata
         FROM document_events de LEFT JOIN invoices i ON i.id=de.invoice_id
         WHERE de.business_id=$1 ORDER BY de.created_at DESC LIMIT 1000`,[b.id]);
      const out=rows.map(x=>({...x,metadata:JSON.stringify(x.metadata||{})}));
      return res.json(report("Activity Logs & Audit Trail",
        [{key:"created_at",label:"Time",datetime:true},{key:"event_type",label:"Event"},{key:"recipient",label:"Recipient"},{key:"invoice_number",label:"Invoice"},{key:"metadata",label:"Details"}],out,{count:out.length},
        "This report currently contains document-delivery activity. A broader immutable audit log can be added for all user actions."));
    }

    if(key==="exception_reports"){
      const {rows}=await db.query(
        `SELECT i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,i.invoice_date,i.due_date,
                GREATEST(i.total-i.amount_paid-i.bad_debt_amount,0)::float AS balance,
                CASE
                  WHEN i.due_date<CURRENT_DATE AND i.total>i.amount_paid+i.bad_debt_amount THEN 'Overdue receivable'
                  WHEN i.customer_id IS NULL THEN 'Missing customer'
                  WHEN b.vat_registered AND c.trn IS NULL THEN 'Customer TRN not recorded'
                  ELSE 'Review'
                END AS exception
         FROM invoices i JOIN businesses b ON b.id=i.business_id LEFT JOIN customers c ON c.id=i.customer_id
         WHERE i.business_id=$1 AND i.status NOT IN ('cancelled')
           AND ((i.due_date<CURRENT_DATE AND i.total>i.amount_paid+i.bad_debt_amount) OR i.customer_id IS NULL OR (b.vat_registered AND c.trn IS NULL))
         ORDER BY i.invoice_date DESC`,[b.id]);
      return res.json(report("Exception Reports",
        [{key:"invoice_number",label:"Invoice"},{key:"customer",label:"Customer"},{key:"invoice_date",label:"Date",date:true},{key:"due_date",label:"Due",date:true},{key:"balance",label:"Balance",money:true},{key:"exception",label:"Exception"}],
        rows,{count:rows.length,currency},"Operational review list; not a tax-compliance determination."));
    }

    if(key==="portal_activities"){
      const {rows}=await db.query(
        `SELECT de.created_at,de.event_type,i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,de.metadata
         FROM document_events de LEFT JOIN invoices i ON i.id=de.invoice_id LEFT JOIN customers c ON c.id=i.customer_id
         WHERE de.business_id=$1 AND de.event_type='viewed'
         ORDER BY de.created_at DESC LIMIT 500`,[b.id]);
      const out=rows.map(x=>({...x,metadata:JSON.stringify(x.metadata||{})}));
      return res.json(report("Portal Activities",
        [{key:"created_at",label:"Time",datetime:true},{key:"customer",label:"Customer"},{key:"invoice_number",label:"Invoice"},{key:"event_type",label:"Activity"},{key:"metadata",label:"Details"}],out,{count:out.length},
        "Currently tracks secure invoice-link views; broader customer-portal events can be added as portal interactions expand."));
    }

    if(key==="bad_debts"){
      const params=[b.id];const p=period("bd.writeoff_date",params);
      const {rows}=await db.query(
        `SELECT bd.writeoff_date,i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                bd.amount::float,bd.reason,bd.notes
         FROM bad_debts bd JOIN invoices i ON i.id=bd.invoice_id LEFT JOIN customers c ON c.id=bd.customer_id
         WHERE bd.business_id=$1 ${p} ORDER BY bd.writeoff_date DESC,bd.created_at DESC`,params);
      return res.json(report("Bad Debts",
        [{key:"writeoff_date",label:"Write-off Date",date:true},{key:"invoice_number",label:"Invoice"},{key:"customer",label:"Customer"},{key:"amount",label:"Amount",money:true},{key:"reason",label:"Reason"},{key:"notes",label:"Notes"}],
        rows,{total_bad_debt:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="bank_charges"){
      const params=[b.id];const p=period("bc.charge_date",params);
      const {rows}=await db.query(
        `SELECT bc.charge_date,bc.bank_name,bc.reference,bc.amount::float,bc.vat_amount::float,p.reference AS payment_reference,i.invoice_number,bc.notes
         FROM bank_charges bc LEFT JOIN payments p ON p.id=bc.payment_id LEFT JOIN invoices i ON i.id=p.invoice_id
         WHERE bc.business_id=$1 ${p} ORDER BY bc.charge_date DESC,bc.created_at DESC`,params);
      return res.json(report("Bank Charges",
        [{key:"charge_date",label:"Date",date:true},{key:"bank_name",label:"Bank"},{key:"invoice_number",label:"Invoice"},{key:"payment_reference",label:"Payment Ref"},{key:"reference",label:"Charge Ref"},{key:"amount",label:"Amount",money:true},{key:"vat_amount",label:"VAT",money:true},{key:"notes",label:"Notes"}],
        rows,{total_bank_charges:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="refund_history"){
      const params=[b.id];const p=period("r.refund_date",params);
      const {rows}=await db.query(
        `SELECT r.refund_date,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,i.invoice_number,
                r.amount::float,r.method,r.reference,r.reason,r.notes
         FROM refunds r LEFT JOIN invoices i ON i.id=r.invoice_id LEFT JOIN customers c ON c.id=r.customer_id
         WHERE r.business_id=$1 ${p} ORDER BY r.refund_date DESC,r.created_at DESC`,params);
      return res.json(report("Refund History",
        [{key:"refund_date",label:"Date",date:true},{key:"customer",label:"Customer"},{key:"invoice_number",label:"Invoice"},{key:"amount",label:"Refund",money:true},{key:"method",label:"Method"},{key:"reference",label:"Reference"},{key:"reason",label:"Reason"}],
        rows,{total_refunds:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="expenses_by_customers"){
      const params=[b.id];const p=period("e.expense_date",params);
      const {rows}=await db.query(
        `SELECT COALESCE(c.company,c.display_name_primary,c.name,'Unassigned') AS customer,COUNT(e.id)::int AS entries,
                COALESCE(SUM(e.amount),0)::float AS amount,COALESCE(SUM(e.vat_amount),0)::float AS vat
         FROM expenses e LEFT JOIN customers c ON c.id=e.customer_id
         WHERE e.business_id=$1 ${p}
         GROUP BY COALESCE(c.company,c.display_name_primary,c.name,'Unassigned') ORDER BY amount DESC`,params);
      return res.json(report("Expenses by Customers",
        [{key:"customer",label:"Customer"},{key:"entries",label:"Entries"},{key:"amount",label:"Amount",money:true},{key:"vat",label:"VAT",money:true}],
        rows,{total_expenses:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="expenses_by_project"){
      const params=[b.id];const p=period("e.expense_date",params);
      const {rows}=await db.query(
        `SELECT COALESCE(pr.project_name,'Unassigned') AS project,COUNT(e.id)::int AS entries,
                COALESCE(SUM(e.amount),0)::float AS amount,COALESCE(SUM(e.vat_amount),0)::float AS vat
         FROM expenses e LEFT JOIN projects pr ON pr.id=e.project_id
         WHERE e.business_id=$1 ${p}
         GROUP BY COALESCE(pr.project_name,'Unassigned') ORDER BY amount DESC`,params);
      return res.json(report("Expenses by Project",
        [{key:"project",label:"Project"},{key:"entries",label:"Entries"},{key:"amount",label:"Amount",money:true},{key:"vat",label:"VAT",money:true}],
        rows,{total_expenses:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="billable_expense_details"){
      const params=[b.id];const p=period("e.expense_date",params);
      const {rows}=await db.query(
        `SELECT e.expense_date,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,pr.project_name,e.supplier,e.category,e.reference,
                e.amount::float,e.vat_amount::float,CASE WHEN e.billed_invoice_id IS NULL THEN 'Unbilled' ELSE 'Billed' END AS billing_status
         FROM expenses e LEFT JOIN customers c ON c.id=e.customer_id LEFT JOIN projects pr ON pr.id=e.project_id
         WHERE e.business_id=$1 AND e.billable=true ${p} ORDER BY e.expense_date DESC,e.created_at DESC`,params);
      return res.json(report("Billable Expense Details",
        [{key:"expense_date",label:"Date",date:true},{key:"customer",label:"Customer"},{key:"project_name",label:"Project"},{key:"supplier",label:"Supplier"},{key:"category",label:"Category"},{key:"reference",label:"Reference"},{key:"amount",label:"Amount",money:true},{key:"vat_amount",label:"VAT",money:true},{key:"billing_status",label:"Billing Status"}],
        rows,{billable_expenses:rows.reduce((s,x)=>s+Number(x.amount||0),0),currency}));
    }

    if(key==="project_summary"){
      const {rows}=await db.query(
        `SELECT p.project_code,p.project_name,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,p.status,p.start_date,p.end_date,p.budget::float,
                COALESCE((SELECT SUM(t.hours) FROM time_entries t WHERE t.project_id=p.id),0)::float AS hours,
                COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.project_id=p.id AND i.status NOT IN ('draft','cancelled')),0)::float AS revenue,
                COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id=p.id),0)::float AS expenses
         FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.business_id=$1 ORDER BY p.created_at DESC`,[b.id]);
      const out=rows.map(x=>({...x,margin:Number(x.revenue||0)-Number(x.expenses||0)}));
      return res.json(report("Project Summary",
        [{key:"project_code",label:"Code"},{key:"project_name",label:"Project"},{key:"customer",label:"Customer"},{key:"status",label:"Status"},{key:"hours",label:"Hours"},{key:"budget",label:"Budget",money:true},{key:"revenue",label:"Revenue",money:true},{key:"expenses",label:"Expenses",money:true},{key:"margin",label:"Margin",money:true}],
        out,{projects:out.length,total_revenue:out.reduce((s,x)=>s+Number(x.revenue||0),0),total_expenses:out.reduce((s,x)=>s+Number(x.expenses||0),0),currency}));
    }

    if(key==="project_details"){
      const {rows}=await db.query(
        `SELECT p.project_code,p.project_name,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,p.status,p.start_date,p.end_date,p.budget::float,p.billing_method,p.hourly_rate::float,p.description
         FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.business_id=$1 ORDER BY p.created_at DESC`,[b.id]);
      return res.json(report("Project Details",
        [{key:"project_code",label:"Code"},{key:"project_name",label:"Project"},{key:"customer",label:"Customer"},{key:"status",label:"Status"},{key:"start_date",label:"Start",date:true},{key:"end_date",label:"End",date:true},{key:"budget",label:"Budget",money:true},{key:"billing_method",label:"Billing Method"},{key:"hourly_rate",label:"Hourly Rate",money:true},{key:"description",label:"Description"}],
        rows,{projects:rows.length,currency}));
    }

    if(key==="projects_revenue_summary"){
      const {rows}=await db.query(
        `SELECT p.project_name,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,
                COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled') THEN i.total ELSE 0 END),0)::float AS revenue,
                COALESCE(SUM(CASE WHEN i.status NOT IN ('draft','cancelled') THEN i.amount_paid ELSE 0 END),0)::float AS received
         FROM projects p LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN invoices i ON i.project_id=p.id
         WHERE p.business_id=$1 GROUP BY p.id,p.project_name,c.company,c.display_name_primary,c.name ORDER BY revenue DESC`,[b.id]);
      return res.json(report("Projects Revenue Summary",
        [{key:"project_name",label:"Project"},{key:"customer",label:"Customer"},{key:"revenue",label:"Revenue",money:true},{key:"received",label:"Received",money:true}],
        rows,{total_revenue:rows.reduce((s,x)=>s+Number(x.revenue||0),0),currency}));
    }

    if(key==="customer_reviews"){
      const params=[b.id];const p=period("r.review_date",params);
      const {rows}=await db.query(
        `SELECT r.review_date,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer,r.rating,r.title,r.review_text,r.source,r.public_permission
         FROM customer_reviews r LEFT JOIN customers c ON c.id=r.customer_id
         WHERE r.business_id=$1 ${p} ORDER BY r.review_date DESC,r.created_at DESC`,params);
      const avg=rows.length?rows.reduce((s,x)=>s+Number(x.rating||0),0)/rows.length:0;
      return res.json(report("Customer Reviews",
        [{key:"review_date",label:"Date",date:true},{key:"customer",label:"Customer"},{key:"rating",label:"Rating"},{key:"title",label:"Title"},{key:"review_text",label:"Review"},{key:"source",label:"Source"},{key:"public_permission",label:"Public Permission",bool:true}],
        rows,{reviews:rows.length,average_rating:Math.round(avg*10)/10}));
    }

    return res.status(400).json({error:"Unknown report"});
  }catch(e){
    res.status(500).json({error:e.message||"Could not generate report"});
  }
}