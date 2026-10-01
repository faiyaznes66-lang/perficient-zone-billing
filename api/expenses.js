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
      `SELECT e.*,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name,p.project_name
       FROM expenses e
       LEFT JOIN customers c ON c.id=e.customer_id
       LEFT JOIN projects p ON p.id=e.project_id
       WHERE e.business_id=$1 ORDER BY e.expense_date DESC,e.created_at DESC`,[b.id]);
    return res.json({expenses:rows});
  }
  const x=req.body||{},amount=Math.max(0,Number(x.amount)||0),vat=Math.max(0,Number(x.vat_amount)||0);
  if(amount<=0) return res.status(400).json({error:"Expense amount is required"});
  if(vat>amount) return res.status(400).json({error:"VAT amount cannot exceed the expense amount"});
  const {rows}=await db.query(
    `INSERT INTO expenses (business_id,expense_date,category,supplier,reference,amount,vat_amount,notes,customer_id,project_id,billable)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [b.id,x.expense_date||new Date().toISOString().slice(0,10),x.category||null,x.supplier||null,x.reference||null,amount,vat,x.notes||null,x.customer_id||null,x.project_id||null,!!x.billable]);
  res.status(201).json({expense:rows[0]});
}