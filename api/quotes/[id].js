import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";

export const access="user";
export const methods=["GET","PUT","DELETE"];

async function business(uid){
  const {rows}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(404).json({error:"Business not found"});
  const id=req.params.id;
  const {rows:q}=await db.query("SELECT * FROM quotes WHERE id=$1 AND business_id=$2",[id,b.id]);
  if(!q[0]) return res.status(404).json({error:"Quote not found"});

  if(req.method==="GET"){
    const {rows:items}=await db.query("SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY position",[id]);
    return res.json({quote:{...q[0],items}});
  }
  if(req.method==="DELETE"){
    await db.query("DELETE FROM quotes WHERE id=$1 AND business_id=$2",[id,b.id]);
    return res.json({ok:true});
  }

  const x=req.body||{};
  if(!Array.isArray(x.items)||!x.items.length) return res.status(400).json({error:"Add at least one quote item"});
  const normalized=b.vat_registered?x:{...x,items:x.items.map(it=>({...it,tax_category:"out_of_scope",tax_rate:0}))};
  const calc=calculateInvoice(normalized);
  const {rows:u}=await db.query(
    `UPDATE quotes SET customer_id=$1,quote_number=$2,quote_date=$3,expiry_date=$4,status=$5,currency=$6,reference=$7,
      notes=$8,terms=$9,vat_mode=$10,discount_type=$11,discount_value=$12,discount_amount=$13,subtotal=$14,vat_amount=$15,total=$16,updated_at=now()
     WHERE id=$17 AND business_id=$18 RETURNING *`,
    [x.customer_id||null,(x.quote_number||q[0].quote_number).trim(),x.quote_date||q[0].quote_date,x.expiry_date||null,x.status||q[0].status,
     x.currency||q[0].currency,x.reference||null,x.notes||null,x.terms||null,x.vat_mode||"exclusive",calc.discount_type,calc.discount_value,
     calc.discount_amount,calc.subtotal,calc.vat_amount,calc.total,id,b.id]);
  await db.query("DELETE FROM quote_items WHERE quote_id=$1",[id]);
  for(const it of calc.items){
    await db.query(
      `INSERT INTO quote_items
      (quote_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id,it.position,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
  }
  res.json({quote:{...u[0],items:calc.items}});
}