import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";

export const access="user";
export const methods=["GET","PUT","DELETE"];

async function ownedBusiness(uid){
  const {rows}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
async function ownedInvoice(businessId,id){
  const {rows}=await db.query("SELECT * FROM invoices WHERE id=$1 AND business_id=$2",[id,businessId]);
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

export default async function(req,res){
  const business=await ownedBusiness(req.user.id);
  if(!business) return res.status(404).json({error:"Business not found"});
  const id=req.params.id;
  const current=await ownedInvoice(business.id,id);
  if(!current) return res.status(404).json({error:"Invoice not found"});

  if(req.method==="GET"){
    const {rows:items}=await db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position",[id]);
    const {rows:customer}=current.customer_id?await db.query("SELECT * FROM customers WHERE id=$1 AND business_id=$2",[current.customer_id,business.id]):{rows:[]};
    return res.json({invoice:{...current,items,customer:customer[0]||null},business});
  }
  if(req.method==="DELETE"){
    await db.query("DELETE FROM invoices WHERE id=$1 AND business_id=$2",[id,business.id]);
    return res.json({ok:true});
  }

  const body=req.body||{};
  if(!Array.isArray(body.items)||body.items.length===0) return res.status(400).json({error:"Add at least one invoice item"});
  const normalizedBody=business.vat_registered?body:{...body,items:body.items.map(it=>({...it,tax_category:"out_of_scope",tax_rate:0}))};
  const calc=calculateInvoice(normalizedBody);
  const comp=compliance(business,body);
  const currency=body.currency||current.currency||business.currency||"AED";
  let rate=1,vatAed=calc.vat_amount;
  if(business.vat_registered && currency!=="AED"){
    rate=Number(body.exchange_rate_to_aed);
    if(!Number.isFinite(rate)||rate<=0) return res.status(400).json({error:"AED exchange rate is required for a VAT invoice issued in a foreign currency"});
    vatAed=Math.round(calc.vat_amount*rate*100)/100;
  }

  const {rows:u}=await db.query(
    `UPDATE invoices SET customer_id=$1,invoice_number=$2,invoice_date=$3,due_date=$4,supply_date=$5,status=$6,
      currency=$7,reference=$8,notes=$9,terms=$10,tax_display=$11,vat_mode=$12,subtotal=$13,discount_amount=$14,
      taxable_amount=$15,vat_amount=$16,total=$17,amount_paid=$18,template_key=$19,invoice_format=$20,
      discount_type=$21,discount_value=$22,share_enabled=$23,exchange_rate_to_aed=$24,vat_amount_aed=$25,language=$26,salesperson_name=$27,project_id=$28,updated_at=now()
     WHERE id=$29 AND business_id=$30 RETURNING *`,
    [body.customer_id||null,(body.invoice_number||current.invoice_number).trim(),body.invoice_date||current.invoice_date,
     body.due_date||null,body.supply_date||null,body.status||current.status,currency,body.reference||null,body.notes||null,
     body.terms||null,comp.tax_display,body.vat_mode||"exclusive",calc.subtotal,calc.discount_amount,calc.taxable_amount,
     calc.vat_amount,calc.total,Math.max(0,Number(body.amount_paid)||0),body.template_key||current.template_key||"classic",
     comp.invoice_format,calc.discount_type,calc.discount_value,body.share_enabled!==false,rate,vatAed,body.language==="ar"?"ar":"en",(body.salesperson_name||"").trim()||null,body.project_id||null,id,business.id]);

  await db.query("DELETE FROM invoice_items WHERE invoice_id=$1",[id]);
  for(const it of calc.items){
    await db.query(
      `INSERT INTO invoice_items
       (invoice_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id,it.position,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
  }
  res.json({invoice:{...u[0],items:calc.items}});
}