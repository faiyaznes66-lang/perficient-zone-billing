import { db } from "hatchable";
export const access="user";export const methods=["GET","POST"];
async function business(uid){const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);return rows[0]||null}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT bc.*,p.reference AS payment_reference,i.invoice_number
       FROM bank_charges bc LEFT JOIN payments p ON p.id=bc.payment_id LEFT JOIN invoices i ON i.id=p.invoice_id
       WHERE bc.business_id=$1 ORDER BY bc.charge_date DESC,bc.created_at DESC`,[b.id]);
    return res.json({bank_charges:rows});
  }
  const x=req.body||{},amount=Math.max(0,Number(x.amount)||0),vat=Math.max(0,Number(x.vat_amount)||0);
  if(amount<=0)return res.status(400).json({error:"Bank charge amount is required"});
  const {rows}=await db.query(
    `INSERT INTO bank_charges (business_id,payment_id,charge_date,bank_name,reference,amount,vat_amount,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.id,x.payment_id||null,x.charge_date||new Date().toISOString().slice(0,10),x.bank_name||null,x.reference||null,amount,vat,x.notes||null]);
  res.status(201).json({bank_charge:rows[0]});
}