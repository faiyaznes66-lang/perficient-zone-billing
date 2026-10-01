import { db, email } from "hatchable";

export const access="user";
export const methods=["POST"];

const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):null;
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

export default async function(req,res){
  const {rows:b}=await db.query(
    "SELECT id,legal_name,trade_name,currency,invoice_accent,logo_url FROM businesses WHERE owner_user_id=$1 LIMIT 1",
    [req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});

  const body=req.body||{};
  const recipient=String(body.recipient||"").trim();
  if(!recipient) return res.status(400).json({error:"Recipient email is required"});

  const from=valid(body.from),toDate=valid(body.date_to),category=String(body.category||"").trim();
  const params=[b[0].id];let where="business_id=$1";
  if(from){params.push(from);where+=` AND expense_date>=$${params.length}`}
  if(toDate){params.push(toDate);where+=` AND expense_date<=$${params.length}`}
  if(category){params.push(category);where+=` AND LOWER(COALESCE(category,''))=LOWER($${params.length})`}

  const {rows}=await db.query(
    `SELECT expense_date,supplier,category,reference,amount::float,vat_amount::float
     FROM expenses WHERE ${where} ORDER BY expense_date DESC,created_at DESC`,params);

  const total=rows.reduce((s,x)=>s+Number(x.amount||0),0);
  const vat=rows.reduce((s,x)=>s+Number(x.vat_amount||0),0);
  const currency=b[0].currency||"AED";
  const brand=b[0].trade_name||b[0].legal_name;
  const accent=/^#[0-9a-fA-F]{6}$/.test(b[0].invoice_accent||"")?b[0].invoice_accent:"#D4A437";
  const period=from||toDate?`${from||"Beginning"} to ${toDate||"Today"}`:"All dates";
  const subject=String(body.subject||`Expense Report - ${brand}`).slice(0,180);

  const tableRows=rows.slice(0,100).map(x=>`<tr>
    <td style="padding:8px;border-bottom:1px solid #e7ebef">${esc(String(x.expense_date).slice(0,10))}</td>
    <td style="padding:8px;border-bottom:1px solid #e7ebef">${esc(x.supplier||"—")}</td>
    <td style="padding:8px;border-bottom:1px solid #e7ebef">${esc(x.category||"Uncategorized")}</td>
    <td style="padding:8px;border-bottom:1px solid #e7ebef;text-align:right">${currency} ${Number(x.amount).toFixed(2)}</td>
  </tr>`).join("");

  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f7fa;margin:0;padding:24px;color:#1F2E3D">
    <div style="max-width:760px;margin:auto;background:white;border-radius:16px;border:1px solid #dfe5eb;overflow:hidden">
      <div style="height:7px;background:${accent}"></div>
      <div style="padding:28px">
        ${b[0].logo_url?`<img src="${esc(b[0].logo_url)}" style="max-width:150px;max-height:60px;margin-bottom:14px" alt="">`:""}
        <h2 style="color:#112B4A;margin:0 0 6px">Expense Report</h2>
        <p style="margin:0 0 22px;color:#66788A">${esc(brand)} · ${esc(period)}${category?` · ${esc(category)}`:""}</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
          <div style="background:#F7F9FC;padding:14px;border-radius:10px"><small>Total expenses</small><div style="font-size:20px;font-weight:700">${currency} ${total.toFixed(2)}</div></div>
          <div style="background:#F7F9FC;padding:14px;border-radius:10px"><small>VAT</small><div style="font-size:20px;font-weight:700">${currency} ${vat.toFixed(2)}</div></div>
          <div style="background:#F7F9FC;padding:14px;border-radius:10px"><small>Entries</small><div style="font-size:20px;font-weight:700">${rows.length}</div></div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#112B4A;color:white"><th style="padding:9px;text-align:left">Date</th><th style="padding:9px;text-align:left">Supplier</th><th style="padding:9px;text-align:left">Category</th><th style="padding:9px;text-align:right">Amount</th></tr></thead>
          <tbody>${tableRows||'<tr><td colspan="4" style="padding:20px;text-align:center">No expenses in this period.</td></tr>'}</tbody>
        </table>
        ${rows.length>100?'<p style="font-size:11px;color:#7c8b95">Email preview shows the first 100 entries.</p>':""}
      </div>
    </div>
  </body></html>`;

  await email.send({to:recipient,subject,html});
  res.json({ok:true,to:recipient,count:rows.length,total_expenses:total,vat_amount:vat});
}