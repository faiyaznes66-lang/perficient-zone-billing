import { db } from "hatchable";

export const access="user";
export const methods=["GET","PUT","DELETE"];

async function business(uid){
  const {rows}=await db.query("SELECT id,currency FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(404).json({error:"Business not found"});
  const id=req.params.id;
  const {rows:found}=await db.query("SELECT * FROM expenses WHERE id=$1 AND business_id=$2",[id,b.id]);
  if(!found[0]) return res.status(404).json({error:"Expense not found"});
  if(req.method==="GET") return res.json({expense:found[0]});
  if(req.method==="DELETE"){
    if(found[0].billed_invoice_id) return res.status(400).json({error:"A billed expense cannot be deleted"});
    await db.query("DELETE FROM expenses WHERE id=$1 AND business_id=$2",[id,b.id]);
    return res.json({ok:true});
  }
  const x=req.body||{},amount=Math.max(0,Number(x.amount)||0),vat=Math.max(0,Number(x.vat_amount)||0);
  if(amount<=0) return res.status(400).json({error:"Expense amount is required"});
  if(vat>amount) return res.status(400).json({error:"VAT amount cannot exceed the expense amount"});
  const {rows}=await db.query(
    `UPDATE expenses SET expense_date=$1,category=$2,supplier=$3,reference=$4,amount=$5,vat_amount=$6,notes=$7,
       customer_id=$8,project_id=$9,billable=$10
     WHERE id=$11 AND business_id=$12 RETURNING *`,
    [x.expense_date||found[0].expense_date,x.category||null,x.supplier||null,x.reference||null,amount,vat,x.notes||null,x.customer_id||null,x.project_id||null,!!x.billable,id,b.id]);
  res.json({expense:rows[0]});
}