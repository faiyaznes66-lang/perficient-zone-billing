import { db, email } from "hatchable";

export const access="user";
export const methods=["POST"];

const e=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

export default async function(req,res){
  const id=req.params.id;
  const {rows:r}=await db.query(
    `SELECT i.id,i.invoice_number,i.total,i.currency,i.public_token,i.share_enabled,i.due_date,i.language,
            b.id AS business_id,b.legal_name,b.trade_name,b.logo_url,b.invoice_accent,b.invoice_footer,
            c.email AS customer_email,c.name AS customer_name,c.company AS customer_company
     FROM invoices i JOIN businesses b ON b.id=i.business_id
     LEFT JOIN customers c ON c.id=i.customer_id
     WHERE i.id=$1 AND b.owner_user_id=$2 LIMIT 1`,[id,req.user.id]);
  const x=r[0];
  if(!x) return res.status(404).json({error:"Invoice not found"});
  if(!x.share_enabled) return res.status(400).json({error:"Enable secure sharing before emailing this invoice"});

  const body=req.body||{};
  const to=(body.to||x.customer_email||"").trim();
  if(!to) return res.status(400).json({error:"Customer email is required"});

  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0];
  const host=req.headers["x-forwarded-host"]||req.headers.host||"invoiceflow-uae.hatchable.site";
  const link=`${proto}://${host}/invoice/${x.public_token}`;
  const sender=x.trade_name||x.legal_name;
  const customer=x.customer_company||x.customer_name||"Customer";
  const ar=x.language==="ar";
  const accent=/^#[0-9a-fA-F]{6}$/.test(x.invoice_accent||"")?x.invoice_accent:"#0e7568";
  const subject=(body.subject||`${ar?"فاتورة":"Invoice"} ${x.invoice_number} ${ar?"من":"from"} ${sender}`).slice(0,180);
  const defaultMessage=ar
    ? `مرحباً ${customer}، فاتورتكم رقم ${x.invoice_number} بقيمة ${x.currency} ${Number(x.total).toFixed(2)} جاهزة للمراجعة.`
    : `Hello ${customer}, your invoice ${x.invoice_number} for ${x.currency} ${Number(x.total).toFixed(2)} is ready to review.`;
  const message=(body.message||defaultMessage).slice(0,2000);
  const cta=ar?"عرض الفاتورة":"View invoice";
  const due=x.due_date?String(x.due_date).slice(0,10):null;

  const html=`<!doctype html><html><body style="margin:0;background:#f3f6f6;font-family:Arial,sans-serif;color:#233642">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f6;padding:28px 12px"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e9e8">
        <tr><td style="height:6px;background:${accent}"></td></tr>
        <tr><td style="padding:30px">
          ${x.logo_url?`<img src="${e(x.logo_url)}" alt="${e(sender)}" style="max-width:150px;max-height:60px;margin-bottom:18px">`:`<div style="font-size:20px;font-weight:800;color:#102a43;margin-bottom:18px">${e(sender)}</div>`}
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px">${e(message)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f9f8;border-radius:12px;margin:18px 0"><tr><td style="padding:18px">
            <div style="font-size:12px;color:#71818b">${ar?"رقم الفاتورة":"Invoice"}</div><div style="font-size:18px;font-weight:800;margin-top:4px">${e(x.invoice_number)}</div>
            <div style="margin-top:12px;font-size:12px;color:#71818b">${ar?"الإجمالي":"Total"}</div><div style="font-size:18px;font-weight:800;margin-top:4px">${e(x.currency)} ${Number(x.total).toFixed(2)}</div>
            ${due?`<div style="margin-top:12px;font-size:12px;color:#71818b">${ar?"تاريخ الاستحقاق":"Due date"}: ${e(due)}</div>`:""}
          </td></tr></table>
          <p style="margin:24px 0"><a href="${e(link)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">${cta}</a></p>
          ${x.invoice_footer?`<p style="color:#788991;font-size:12px;line-height:1.6">${e(x.invoice_footer)}</p>`:""}
          <p style="color:#87969d;font-size:11px;line-height:1.5;margin-top:28px">${ar?"هذا الرابط مخصص للمستلم.":"This secure link is intended for the recipient."}</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  await email.send({to,subject,html});
  await db.query(
    "UPDATE invoices SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END,sent_at=COALESCE(sent_at,now()),updated_at=now() WHERE id=$1",
    [id]);
  await db.query(
    "INSERT INTO document_events (business_id,invoice_id,event_type,recipient,metadata) VALUES ($1,$2,'emailed',$3,$4::jsonb)",
    [x.business_id,id,to,JSON.stringify({subject})]);

  res.json({ok:true,to,link});
}