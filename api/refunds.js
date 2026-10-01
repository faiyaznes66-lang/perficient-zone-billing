import { db } from "hatchable";
export const access="user";export const methods=["GET","POST"];
async function business(uid){const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);return rows[0]||null}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT r.*,i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name
       FROM refunds r LEFT JOIN invoices i ON i.id=r.invoice_id LEFT JOIN customers c ON c.id=r.customer_id
       WHERE r.business_id=$1 ORDER BY r.refund_date DESC,r.created_at DESC`,[b.id]);
    return res.json({refunds:rows});
  }
  const x=req.body||{},amount=Math.max(0,Number(x.amount)||0);
  if(!x.payment_id||amount<=0)return res.status(400).json({error:"Payment and refund amount are required"});
  const {rows:p}=await db.query(
    `SELECT p.*,i.customer_id,i.total,i.amount_paid,i.bad_debt_amount FROM payments p JOIN invoices i ON i.id=p.invoice_id
     WHERE p.id=$1 AND p.business_id=$2`,[x.payment_id,b.id]);
  if(!p[0])return res.status(404).json({error:"Payment not found"});
  const {rows:rr}=await db.query("SELECT COALESCE(SUM(amount),0)::float AS refunded FROM refunds WHERE payment_id=$1 AND business_id=$2",[x.payment_id,b.id]);
  if(amount>Number(p[0].amount)-Number(rr[0].refunded)+0.009)return res.status(400).json({error:"Refund exceeds the refundable amount for this payment"});
  const {rows}=await db.query(
    `INSERT INTO refunds (business_id,payment_id,invoice_id,customer_id,refund_date,amount,method,reference,reason,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.id,p[0].id,p[0].invoice_id,p[0].customer_id,x.refund_date||new Date().toISOString().slice(0,10),amount,x.method||"bank_transfer",x.reference||null,x.reason||null,x.notes||null]);
  const newPaid=Math.max(0,Number(p[0].amount_paid)-amount),settled=newPaid+Number(p[0].bad_debt_amount||0);
  const status=settled+0.009>=Number(p[0].total)?"paid":newPaid>0?"partially_paid":"sent";
  await db.query("UPDATE invoices SET amount_paid=$1,status=$2,updated_at=now() WHERE id=$3 AND business_id=$4",[newPaid,status,p[0].invoice_id,b.id]);
  res.status(201).json({refund:rows[0]});
}