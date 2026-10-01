import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id,currency FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Complete business setup first"});
  const id=b[0].id;
  const {rows:sales}=await db.query(
    `SELECT
      COALESCE(SUM(total),0)::float AS sales,
      COALESCE(SUM(vat_amount),0)::float AS output_vat,
      COALESCE(SUM(amount_paid),0)::float AS collected,
      COALESCE(SUM(GREATEST(total-amount_paid,0)),0)::float AS outstanding
     FROM invoices WHERE business_id=$1 AND status NOT IN ('draft','cancelled')`,[id]);
  const {rows:exp}=await db.query(
    `SELECT COALESCE(SUM(amount),0)::float AS expenses,
            COALESCE(SUM(vat_amount),0)::float AS input_vat
     FROM expenses WHERE business_id=$1`,[id]);
  const {rows:monthly}=await db.query(
    `SELECT to_char(date_trunc('month',invoice_date),'YYYY-MM') AS month,
            COALESCE(SUM(total),0)::float AS sales
     FROM invoices WHERE business_id=$1 AND status NOT IN ('draft','cancelled')
     GROUP BY date_trunc('month',invoice_date)
     ORDER BY date_trunc('month',invoice_date) DESC LIMIT 12`,[id]);
  res.json({currency:b[0].currency,summary:{...sales[0],...exp[0],net_vat:Number(sales[0].output_vat)-Number(exp[0].input_vat)},monthly});
}