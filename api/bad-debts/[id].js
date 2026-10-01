import { db } from "hatchable";

export const access="user";
export const methods=["GET","PUT","DELETE"];

async function business(uid){
  const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
async function syncInvoice(businessId,invoiceId){
  const {rows:i}=await db.query("SELECT total,amount_paid,status FROM invoices WHERE id=$1 AND business_id=$2",[invoiceId,businessId]);
  if(!i[0]) return;
  const {rows:w}=await db.query("SELECT COALESCE(SUM(amount),0)::float AS amount FROM bad_debts WHERE business_id=$1 AND invoice_id=$2",[businessId,invoiceId]);
  const bad=Math.max(0,Number(w[0].amount||0)),paid=Number(i[0].amount_paid||0),total=Number(i[0].total||0);
  let status=i[0].status;
  if(!["draft","cancelled"].includes(status)){
    status=paid+bad+0.009>=total?(bad>0?"written_off":"paid"):paid>0?"partially_paid":"sent";
  }
  await db.query("UPDATE invoices SET bad_debt_amount=$1,status=$2,updated_at=now() WHERE id=$3 AND business_id=$4",[bad,status,invoiceId,businessId]);
}

export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(404).json({error:"Business not found"});
  const {rows:f}=await db.query(
    `SELECT bd.*,i.invoice_number,i.total::float,i.amount_paid::float,i.bad_debt_amount::float,
            COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name
     FROM bad_debts bd JOIN invoices i ON i.id=bd.invoice_id LEFT JOIN customers c ON c.id=bd.customer_id
     WHERE bd.id=$1 AND bd.business_id=$2`,[req.params.id,b.id]);
  const x=f[0];if(!x)return res.status(404).json({error:"Bad-debt write-off not found"});
  if(req.method==="GET")return res.json({bad_debt:x});
  if(req.method==="DELETE"){await db.query("DELETE FROM bad_debts WHERE id=$1 AND business_id=$2",[x.id,b.id]);await syncInvoice(b.id,x.invoice_id);return res.json({ok:true})}

  const body=req.body||{},amount=Math.max(0,Number(body.amount)||0);
  const {rows:other}=await db.query("SELECT COALESCE(SUM(amount),0)::float AS amount FROM bad_debts WHERE business_id=$1 AND invoice_id=$2 AND id<>$3",[b.id,x.invoice_id,x.id]);
  const available=Math.max(0,Number(x.total)-Number(x.amount_paid)-Number(other[0].amount||0));
  if(amount<=0||amount>available+0.009)return res.status(400).json({error:"Write-off amount must be within the remaining invoice balance"});
  const {rows}=await db.query(
    `UPDATE bad_debts SET writeoff_date=$1,amount=$2,reason=$3,notes=$4
     WHERE id=$5 AND business_id=$6 RETURNING *`,
    [body.writeoff_date||x.writeoff_date,amount,body.reason||null,body.notes||null,x.id,b.id]);
  await syncInvoice(b.id,x.invoice_id);
  res.json({bad_debt:rows[0]});
}