import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";
import { requireInvoiceCapacity } from "lib/plans.js";

export const access="user";
export const methods=["GET","POST"];

async function getBusiness(uid){
  const {rows}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
function compliance(business,body){
  const format=body.invoice_format==="simplified"?"simplified":"full";
  if(!business.vat_registered){
    const allowed=["line","totals","hidden"];
    return {invoice_format:format,tax_display:allowed.includes(body.tax_display)?body.tax_display:"hidden"};
  }
  return {invoice_format:format,tax_display:format==="simplified"?"totals":"line"};
}
function fx(business,body,vat){
  const currency=body.currency||business.currency||"AED";
  if(!business.vat_registered || currency==="AED") return {rate:1,vatAed:vat};
  const rate=Number(body.exchange_rate_to_aed);
  if(!Number.isFinite(rate)||rate<=0) throw new Error("AED exchange rate is required for a VAT invoice issued in a foreign currency");
  return {rate,vatAed:Math.round(vat*rate*100)/100};
}

export default async function(req,res){
  const business=await getBusiness(req.user.id);
  if(!business) return res.status(400).json({error:"Complete business setup first"});

  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT i.id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.currency,
              i.total::float,i.amount_paid::float,i.bad_debt_amount::float,i.project_id,i.public_token,i.share_enabled,i.template_key,
              COALESCE(c.company,c.name,'—') AS customer_name
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
       WHERE i.business_id=$1 ORDER BY i.created_at DESC`,[business.id]);
    return res.json({invoices:rows});
  }

  const body=req.body||{};
  if(!Array.isArray(body.items)||body.items.length===0) return res.status(400).json({error:"Add at least one invoice item"});
  try{await requireInvoiceCapacity(db,business.id)}catch(e){return res.status(e.status||402).json({error:e.message,code:e.code||"PLAN_LIMIT"})}
  const normalizedBody=business.vat_registered?body:{...body,items:body.items.map(it=>({...it,tax_category:"out_of_scope",tax_rate:0}))};
  const calc=calculateInvoice(normalizedBody);
  const comp=compliance(business,body);
  let f;
  try{f=fx(business,body,calc.vat_amount)}catch(e){return res.status(400).json({error:e.message})}

  let invoiceNumber=(body.invoice_number||"").trim();
  if(!invoiceNumber){
    const {rows:a}=await db.query(
      "UPDATE businesses SET next_invoice_number=next_invoice_number+1,updated_at=now() WHERE id=$1 RETURNING invoice_prefix,next_invoice_number-1 AS allocated",
      [business.id]);
    invoiceNumber=`${a[0].invoice_prefix}${String(a[0].allocated).padStart(4,"0")}`;
  }

  const {rows:created}=await db.query(
    `INSERT INTO invoices
      (business_id,customer_id,invoice_number,invoice_date,due_date,supply_date,status,currency,reference,notes,terms,
       tax_display,vat_mode,subtotal,discount_amount,taxable_amount,vat_amount,total,amount_paid,
       template_key,invoice_format,discount_type,discount_value,share_enabled,exchange_rate_to_aed,vat_amount_aed,language,salesperson_name,project_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
     RETURNING *`,
    [business.id,body.customer_id||null,invoiceNumber,body.invoice_date||new Date().toISOString().slice(0,10),
     body.due_date||null,body.supply_date||null,body.status||"draft",body.currency||business.currency||"AED",
     body.reference||null,body.notes||null,body.terms||"Payment due on receipt",comp.tax_display,body.vat_mode||"exclusive",
     calc.subtotal,calc.discount_amount,calc.taxable_amount,calc.vat_amount,calc.total,Math.max(0,Number(body.amount_paid)||0),
     body.template_key||"classic",comp.invoice_format,calc.discount_type,calc.discount_value,body.share_enabled!==false,
     f.rate,f.vatAed,body.language==="ar"?"ar":"en",(body.salesperson_name||"").trim()||null,body.project_id||null]);

  const invoice=created[0];
  for(const it of calc.items){
    await db.query(
      `INSERT INTO invoice_items
       (invoice_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [invoice.id,it.position,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
  }
  res.status(201).json({invoice:{...invoice,items:calc.items}});
}