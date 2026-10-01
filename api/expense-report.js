import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):null;

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id,legal_name,trade_name,currency FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const q=req.query||{},from=validDate(q.from),to=validDate(q.to),category=(q.category||"").trim();

  const params=[b[0].id];let where="business_id=$1";
  if(from){params.push(from);where+=` AND expense_date>=$${params.length}`}
  if(to){params.push(to);where+=` AND expense_date<=$${params.length}`}
  if(category){params.push(category);where+=` AND LOWER(COALESCE(category,''))=LOWER($${params.length})`}

  const {rows}=await db.query(
    `SELECT id,expense_date,category,supplier,reference,amount::float,vat_amount::float,notes
     FROM expenses WHERE ${where} ORDER BY expense_date DESC,created_at DESC`,params);

  const total=rows.reduce((s,x)=>s+Number(x.amount||0),0);
  const vat=rows.reduce((s,x)=>s+Number(x.vat_amount||0),0);
  const byCategory={};
  for(const x of rows){const k=x.category||"Uncategorized";byCategory[k]=(byCategory[k]||0)+Number(x.amount||0)}

  res.json({
    business:{name:b[0].trade_name||b[0].legal_name,currency:b[0].currency||"AED"},
    filters:{from,to,category:category||null},
    summary:{count:rows.length,total_expenses:total,vat_amount:vat,net_before_vat:total-vat},
    by_category:Object.entries(byCategory).map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount),
    expenses:rows
  });
}