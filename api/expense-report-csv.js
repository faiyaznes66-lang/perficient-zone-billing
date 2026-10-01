import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

const csvq=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):null;

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).send("Business not found");
  const x=req.query||{},from=valid(x.from),to=valid(x.to),category=(x.category||"").trim();

  const params=[b[0].id];let where="business_id=$1";
  if(from){params.push(from);where+=` AND expense_date>=$${params.length}`}
  if(to){params.push(to);where+=` AND expense_date<=$${params.length}`}
  if(category){params.push(category);where+=` AND LOWER(COALESCE(category,''))=LOWER($${params.length})`}

  const {rows}=await db.query(
    `SELECT expense_date,supplier,category,reference,amount,vat_amount,notes
     FROM expenses WHERE ${where} ORDER BY expense_date DESC,created_at DESC`,params);

  const headers=["Date","Supplier","Category","Reference","Amount","VAT","Net Before VAT","Notes"];
  const data=rows.map(r=>[
    String(r.expense_date).slice(0,10),r.supplier,r.category,r.reference,
    Number(r.amount).toFixed(2),Number(r.vat_amount).toFixed(2),
    (Number(r.amount)-Number(r.vat_amount)).toFixed(2),r.notes
  ]);
  const csv=[headers,...data].map(row=>row.map(csvq).join(",")).join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="expense-report.csv"');
  res.send("\ufeff"+csv);
}