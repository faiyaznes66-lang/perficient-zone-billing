import { db } from "hatchable";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:r}=await db.query(
    `SELECT i.id,i.invoice_number,b.id AS business_id
     FROM invoices i JOIN businesses b ON b.id=i.business_id
     WHERE i.id=$1 AND b.owner_user_id=$2 LIMIT 1`,[req.params.id,req.user.id]);
  if(!r[0]) return res.status(404).json({error:"Invoice not found"});
  const {rows:c}=await db.query("SELECT * FROM einvoice_connections WHERE business_id=$1 LIMIT 1",[r[0].business_id]);
  const conn=c[0];
  if(!conn||conn.status!=="connected"){
    return res.status(409).json({
      error:"UAE e-invoicing provider not connected",
      code:"EINVOICE_PROVIDER_REQUIRED",
      message:"No submission was attempted. Connect an appropriate UAE Accredited Service Provider before enabling transmission."
    });
  }
  return res.status(501).json({
    error:"Provider adapter not configured",
    code:"EINVOICE_ADAPTER_REQUIRED",
    message:"The connection record exists, but a provider-specific API adapter must be configured before transmission."
  });
}