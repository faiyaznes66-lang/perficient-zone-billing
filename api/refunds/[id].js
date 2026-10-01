import { db } from "hatchable";

export const access="user";
export const methods=["GET","PUT","DELETE"];

async function business(uid){
  const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
async function syncInvoice(businessId,invoiceId){
  const {rows:i}=await db.query("SELECT total,bad_debt_amount,status FROM invoices WHERE id=$1 AND business_id=$2",[invoiceId,businessId]);
  if(!i[0]) return;
  const {rows:p}=await db.query("SELECT COALESCE(SUM(amount),0)::float AS paid FROM payments WHERE business_id=$1 AND invoice_id=$2",[businessId,invoiceId]);
  const {rows:r}=await db.query("SELECT COALESCE(SUM(amount),0)::float AS refunded FROM refunds WHERE business_id=$1 AND invoice_id=$2",[businessId,invoiceId]);
  const paid=Math.max(0,Number(p[0].paid||0)-Number(r[0].refunded||0));
  const bad=Number(i[0].bad_debt_amount||0),total=Number(i[0].total||0),settled=paid+bad;
  let status=i[0].status;
  if(!["draft","cancelled"].includes(status)){
    status=settled+0.009>=total?(bad>0?"written_off":"paid"):paid>0?"partially_paid":"sent";
  }
  await db.query("UPDATE invoices SET amount_paid=$1,status=$2,updated_at=now() WHERE id=$3 AND business_id=$4",[paid,status,invoiceId,businessId]);
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(404).json({error:"Business not found"});
  const {rows:f}=await db.query(
    `SELECT r.*,i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name
     FROM refunds r LEFT JOIN invoices i ON i.id=r.invoice_id LEFT JOIN customers c ON c.id=r.customer_id
     WHERE r.id=$1 AND r.business_id=$2`,[req.params.id,b.id]);
  const x=f[0];if(!x) return res.status(404).json({error:"Refund not found"});
  if(req.method==="GET") return res.json({refund:x});

  if(req.method==="DELETE"){
    await db.query("DELETE FROM refunds WHERE id=$1 AND business_id=$2",[x.id,b.id]);
    await syncInvoice(b.id,x.invoice_id);
    return res.json({ok:true});
  }

  const body=req.body||{},amount=Math.max(0,Number(body.amount)||0);
  if(amount<=0) return res.status(400).json({error:"Refund amount is required"});
  const {rows:pay}=await db.query("SELECT amount FROM payments WHERE id=$1 AND business_id=$2",[x.payment_id,b.id]);
  if(!pay[0]) return res.status(404).json({error:"Original payment not found"});
  const {rows:other}=await db.query("SELECT COALESCE(SUM(amount),0)::float AS amount FROM refunds WHERE payment_id=$1 AND business_id=$2 AND id<>$3",[x.payment_id,b.id,x.id]);
  if(amount+Number(other[0].amount||0)>Number(pay[0].amount)+0.009) return res.status(400).json({error:"Refund exceeds the refundable amount for this payment"});

  const {rows}=await db.query(
    `UPDATE refunds SET refund_date=$1,amount=$2,method=$3,reference=$4,reason=$5,notes=$6
     WHERE id=$7 AND business_id=$8 RETURNING *`,
    [body.refund_date||x.refund_date,amount,body.method||x.method||"bank_transfer",body.reference||null,body.reason||null,body.notes||null,x.id,b.id]);
  await syncInvoice(b.id,x.invoice_id);
  res.json({refund:rows[0]});
}