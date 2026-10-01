export const PLANS={
  free:{key:"free",name:"Free",monthly_invoice_limit:5,recurring:false,portal:false,branding:true,businesses:1},
  starter:{key:"starter",name:"Starter",monthly_invoice_limit:100,recurring:false,portal:false,branding:true,businesses:1},
  pro:{key:"pro",name:"Pro",monthly_invoice_limit:null,recurring:true,portal:true,branding:false,businesses:1},
  business:{key:"business",name:"Business",monthly_invoice_limit:null,recurring:true,portal:true,branding:false,businesses:5}
};

export async function planState(db,businessId){
  const {rows:s}=await db.query("SELECT * FROM subscriptions WHERE business_id=$1 LIMIT 1",[businessId]);
  const sub=s[0]||null;
  const key=sub&&PLANS[sub.plan_key]?sub.plan_key:"free";
  const plan=PLANS[key];
  const {rows:u}=await db.query(
    `SELECT COUNT(*)::int AS invoices_this_month
     FROM invoices
     WHERE business_id=$1
       AND created_at>=date_trunc('month',CURRENT_TIMESTAMP)
       AND created_at<date_trunc('month',CURRENT_TIMESTAMP)+interval '1 month'`,[businessId]);
  const used=u[0].invoices_this_month;
  return {
    plan,subscription:sub,
    usage:{invoices_this_month:used},
    can_create_invoice:plan.monthly_invoice_limit===null||used<plan.monthly_invoice_limit,
    remaining_invoices:plan.monthly_invoice_limit===null?null:Math.max(0,plan.monthly_invoice_limit-used)
  };
}

export async function requireInvoiceCapacity(db,businessId){
  const s=await planState(db,businessId);
  if(!s.can_create_invoice){
    const e=new Error(`Your ${s.plan.name} plan allows ${s.plan.monthly_invoice_limit} invoices per month. Upgrade to create more invoices.`);
    e.code="PLAN_LIMIT";e.status=402;throw e;
  }
  return s;
}

export async function requireFeature(db,businessId,feature){
  const s=await planState(db,businessId);
  if(!s.plan[feature]){
    const e=new Error(`${feature==="recurring"?"Recurring invoices":"Customer portal"} require the Pro or Business plan.`);
    e.code="PLAN_FEATURE";e.status=402;throw e;
  }
  return s;
}