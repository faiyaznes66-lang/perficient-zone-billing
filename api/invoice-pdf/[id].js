import { db, browser } from "hatchable";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const id=req.params.id;
  const {rows:r}=await db.query(
    `SELECT i.invoice_number,i.public_token,i.share_enabled
     FROM invoices i JOIN businesses b ON b.id=i.business_id
     WHERE i.id=$1 AND b.owner_user_id=$2 LIMIT 1`,[id,req.user.id]);
  const x=r[0];
  if(!x) return res.status(404).json({error:"Invoice not found"});
  if(!x.share_enabled) return res.status(400).json({error:"Enable secure sharing before generating the PDF"});
  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0];
  const host=req.headers["x-forwarded-host"]||req.headers.host;
  const base=(process.env.APP_URL||(host?`${proto}://${host}`:"")).replace(/\/$/,"");
  const url=`${base}/invoice/${x.public_token}?render=pdf`;
  try{
    const pdf=await browser.pdf(url);
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${String(x.invoice_number).replace(/[^a-zA-Z0-9_-]/g,"_")}.pdf"`);
    res.send(pdf);
  }catch(e){
    res.status(503).json({error:"Server PDF generation is not configured on this deployment yet. Use Print / Save PDF, or configure BROWSERLESS_URL and BROWSERLESS_TOKEN."});
  }
}