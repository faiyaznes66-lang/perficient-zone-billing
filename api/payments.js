import { db } from "hatchable";

export const access="user";
export const methods=["GET","POST"];

async function business(uid){
  const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT p.*,i.invoice_number,c.name AS customer_name,c.company AS customer_company
       FROM payments p
       JOIN invoices i ON i.id=p.invoice_id
       LEFT JOIN customers c ON c.id=i.customer_id
       WHERE p.business_id=$1 ORDER BY p.payment_date DESC,p.created_at DESC`,[b.id]);
    return res.json({payments:rows});
  }
  const x=req.body||{},amount=Math.max(0,Number(x.amount)||0);
  if(!x.invoice_id||amount<=0) return res.status(400).json({error:"Invoice and payment amount are required"});
  const {rows:inv}=await db.query("SELECT id,total,amount_paid,bad_debt_amount FROM invoices WHERE id=$1 AND business_id=$2",[x.invoice_id,b.id]);
  if(!inv[0]) return res.status(404).json({error:"Invoice not found"});
  const remaining=Math.max(0,Number(inv[0].total)-Number(inv[0].amount_paid)-Number(inv[0].bad_debt_amount||0));
  if(amount>remaining+0.009) return res.status(400).json({error:"Payment exceeds the outstanding balance"});
  const {rows}=await db.query(
    `INSERT INTO payments (business_id,invoice_id,payment_date,amount,method,reference,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.id,x.invoice_id,x.payment_date||new Date().toISOString().slice(0,10),amount,x.method||"bank_transfer",x.reference||null,x.notes||null]);
  const newPaid=Number(inv[0].amount_paid)+amount;
  const settled=newPaid+Number(inv[0].bad_debt_amount||0);const status=settled+0.009>=Number(inv[0].total)?(Number(inv[0].bad_debt_amount||0)>0?"written_off":"paid"):"partially_paid";
  await db.query("UPDATE invoices SET amount_paid=$1,status=$2,updated_at=now() WHERE id=$3 AND business_id=$4",[newPaid,status,x.invoice_id,b.id]);
  res.status(201).json({payment:rows[0],invoice:{id:x.invoice_id,amount_paid:newPaid,status}});
}