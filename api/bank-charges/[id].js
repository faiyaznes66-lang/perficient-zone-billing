import { db } from "hatchable";

export const access="user";
export const methods=["GET","PUT","DELETE"];

async function business(uid){
  const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(404).json({error:"Business not found"});
  const {rows:f}=await db.query(
    `SELECT bc.*,p.reference AS payment_reference,i.invoice_number
     FROM bank_charges bc LEFT JOIN payments p ON p.id=bc.payment_id LEFT JOIN invoices i ON i.id=p.invoice_id
     WHERE bc.id=$1 AND bc.business_id=$2`,[req.params.id,b.id]);
  const x=f[0];if(!x)return res.status(404).json({error:"Bank charge not found"});
  if(req.method==="GET")return res.json({bank_charge:x});
  if(req.method==="DELETE"){await db.query("DELETE FROM bank_charges WHERE id=$1 AND business_id=$2",[x.id,b.id]);return res.json({ok:true})}
  const body=req.body||{},amount=Math.max(0,Number(body.amount)||0),vat=Math.max(0,Number(body.vat_amount)||0);
  if(amount<=0)return res.status(400).json({error:"Bank charge amount is required"});
  if(vat>amount)return res.status(400).json({error:"VAT amount cannot exceed the bank charge"});
  const {rows}=await db.query(
    `UPDATE bank_charges SET payment_id=$1,charge_date=$2,bank_name=$3,reference=$4,amount=$5,vat_amount=$6,notes=$7
     WHERE id=$8 AND business_id=$9 RETURNING *`,
    [body.payment_id||null,body.charge_date||x.charge_date,body.bank_name||null,body.reference||null,amount,vat,body.notes||null,x.id,b.id]);
  res.json({bank_charge:rows[0]});
}