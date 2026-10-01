import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";
import { requireInvoiceCapacity } from "lib/plans.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  const business=b[0];if(!business)return res.status(400).json({error:"Business not found"});
  try{await requireInvoiceCapacity(db,business.id)}catch(e){return res.status(e.status||402).json({error:e.message,code:e.code||"PLAN_LIMIT"})}
  const {rows:e}=await db.query("SELECT * FROM expenses WHERE id=$1 AND business_id=$2",[req.params.id,business.id]);
  const exp=e[0];if(!exp)return res.status(404).json({error:"Expense not found"});
  if(!exp.billable)return res.status(400).json({error:"This expense is not marked billable"});
  if(!exp.customer_id)return res.status(400).json({error:"Assign a customer before billing this expense"});
  if(exp.billed_invoice_id)return res.status(400).json({error:"This expense has already been billed"});

  const net=Math.max(0,Number(exp.amount)-Number(exp.vat_amount||0));
  const item={item_name:"Billable expense reimbursement",description:[exp.supplier,exp.category,exp.reference].filter(Boolean).join(" · "),quantity:1,unit:"expense",rate:net,discount_percent:0,tax_rate:business.vat_registered?Number(business.default_tax_rate||5):0,tax_category:business.vat_registered?"standard":"out_of_scope"};
  const calc=calculateInvoice({vat_mode:"exclusive",discount_type:"fixed",discount_value:0,items:[item]});
  const {rows:a}=await db.query("UPDATE businesses SET next_invoice_number=next_invoice_number+1,updated_at=now() WHERE id=$1 RETURNING invoice_prefix,next_invoice_number-1 AS allocated",[business.id]);
  const number=`${a[0].invoice_prefix}${String(a[0].allocated).padStart(4,"0")}`;
  const taxDisplay=business.vat_registered?"line":"hidden";
  const {rows:inv}=await db.query(
    `INSERT INTO invoices
      (business_id,customer_id,project_id,invoice_number,invoice_date,due_date,supply_date,status,currency,notes,terms,tax_display,vat_mode,
       subtotal,discount_amount,taxable_amount,vat_amount,total,amount_paid,invoice_format,discount_type,discount_value,vat_amount_aed,language)
     VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE,CURRENT_DATE,'draft',$5,$6,$7,$8,'exclusive',$9,0,$9,$10,$11,0,'full','fixed',0,$10,$12)
     RETURNING *`,
    [business.id,exp.customer_id,exp.project_id||null,number,business.currency||"AED","Created from a billable expense. Review the invoice and VAT treatment before issuing.","Payment due on receipt",taxDisplay,calc.subtotal,calc.vat_amount,calc.total,business.default_language==="ar"?"ar":"en"]);
  const it=calc.items[0];
  await db.query(
    `INSERT INTO invoice_items (invoice_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
     VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [inv[0].id,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
  await db.query("UPDATE expenses SET billed_invoice_id=$1 WHERE id=$2",[inv[0].id,exp.id]);
  res.status(201).json({invoice:inv[0]});
}