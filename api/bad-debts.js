import { db } from "hatchable";
export const access="user";export const methods=["GET","POST"];
async function business(uid){const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);return rows[0]||null}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT bd.*,i.invoice_number,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name
       FROM bad_debts bd JOIN invoices i ON i.id=bd.invoice_id LEFT JOIN customers c ON c.id=bd.customer_id
       WHERE bd.business_id=$1 ORDER BY bd.writeoff_date DESC,bd.created_at DESC`,[b.id]);
    return res.json({bad_debts:rows});
  }
  const x=req.body||{},amount=Math.max(0,Number(x.amount)||0);
  const {rows:i}=await db.query("SELECT * FROM invoices WHERE id=$1 AND business_id=$2",[x.invoice_id,b.id]);
  if(!i[0])return res.status(404).json({error:"Invoice not found"});
  if(["draft","cancelled"].includes(i[0].status)) return res.status(400).json({error:"Only an issued invoice can be written off as bad debt"});
  const available=Math.max(0,Number(i[0].total)-Number(i[0].amount_paid)-Number(i[0].bad_debt_amount||0));
  if(amount<=0||amount>available+0.009)return res.status(400).json({error:"Write-off amount must be within the current outstanding balance"});
  const {rows}=await db.query(
    `INSERT INTO bad_debts (business_id,invoice_id,customer_id,writeoff_date,amount,reason,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.id,i[0].id,i[0].customer_id,x.writeoff_date||new Date().toISOString().slice(0,10),amount,x.reason||null,x.notes||null]);
  const newBad=Number(i[0].bad_debt_amount||0)+amount,settled=Number(i[0].amount_paid)+newBad;
  const status=settled+0.009>=Number(i[0].total)?"written_off":i[0].status;
  await db.query("UPDATE invoices SET bad_debt_amount=$1,status=$2,updated_at=now() WHERE id=$3 AND business_id=$4",[newBad,status,i[0].id,b.id]);
  res.status(201).json({bad_debt:rows[0]});
}