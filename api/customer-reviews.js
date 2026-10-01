import { db } from "hatchable";
export const access="user";export const methods=["GET","POST"];
async function business(uid){const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);return rows[0]||null}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const cid=req.query&&req.query.customer_id;const params=[b.id];let where="r.business_id=$1";
    if(cid){params.push(cid);where+=` AND r.customer_id=$2`}
    const {rows}=await db.query(
      `SELECT r.*,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name
       FROM customer_reviews r LEFT JOIN customers c ON c.id=r.customer_id
       WHERE ${where} ORDER BY r.review_date DESC,r.created_at DESC`,params);
    return res.json({reviews:rows});
  }
  const x=req.body||{},rating=Math.round(Number(x.rating)||0);
  if(!x.customer_id||rating<1||rating>5)return res.status(400).json({error:"Customer and rating from 1 to 5 are required"});
  const {rows}=await db.query(
    `INSERT INTO customer_reviews (business_id,customer_id,review_date,rating,title,review_text,source,public_permission)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.id,x.customer_id,x.review_date||new Date().toISOString().slice(0,10),rating,x.title||null,x.review_text||null,x.source||"direct",!!x.public_permission]);
  res.status(201).json({review:rows[0]});
}