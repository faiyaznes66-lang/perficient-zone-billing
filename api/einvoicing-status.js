import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

function timeline(band){
  if(band==="at_or_above_50m") return {
    appointment_deadline:"2026-10-30",
    implementation_date:"2027-01-01",
    phase:"AED 50 million or above",
    appointment_overdue:true
  };
  if(band==="below_50m") return {
    appointment_deadline:"2027-03-31",
    implementation_date:"2027-07-01",
    phase:"Below AED 50 million",
    appointment_overdue:false
  };
  if(band==="government") return {
    appointment_deadline:"2027-03-31",
    implementation_date:"2027-10-01",
    phase:"Government entity",
    appointment_overdue:false
  };
  return null;
}

export default async function(req,res){
  const {rows:b}=await db.query(
    `SELECT id,legal_name,trn,tin_number,vat_registered,address,emirate,trade_license_number,
            trade_license_authority,city,einvoice_scope_status,einvoice_revenue_band,
            einvoice_is_tax_group_member,einvoice_branch_trade_license_number
     FROM businesses WHERE owner_user_id=$1 LIMIT 1`,[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const business=b[0];
  const {rows:c}=await db.query("SELECT id,provider_name,provider_code,accreditation_number,status,environment,participant_id,last_checked_at,last_error,connected_at FROM einvoice_connections WHERE business_id=$1 LIMIT 1",[business.id]);
  const conn=c[0]||null;
  const {rows:counts}=await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE customer_type='business' OR einvoice_buyer_type='government')::int AS business_customers,
       COUNT(*) FILTER (
         WHERE (customer_type='business' OR einvoice_buyer_type='government')
           AND (COALESCE(tin_number,'')='' OR COALESCE(electronic_address,'')='')
       )::int AS customers_missing_identifiers
     FROM customers WHERE business_id=$1`,[business.id]);
  const connected=!!(conn&&conn.status==="connected"&&conn.provider_code&&conn.accreditation_number);
  const due=timeline(business.einvoice_revenue_band);
  if(due) due.appointment_overdue=new Date().toISOString().slice(0,10)>due.appointment_deadline;
  const readiness={
    business_name:!!business.legal_name,
    tin:/^\d{10}$/.test(String(business.tin_number||"")),
    trade_license:!!business.trade_license_number,
    seller_address:!!business.address&&!!business.city,
    trn:!business.vat_registered||!!business.trn,
    customer_identifiers:!!(counts[0]&&Number(counts[0].customers_missing_identifiers)===0),
    asp_provider_connected:connected
  };
  const required=["business_name","tin","trade_license","seller_address","trn"];
  const ready=required.every(k=>readiness[k]);
  res.json({
    connected,
    connection:conn,
    scope_status:business.einvoice_scope_status||"not_assessed",
    revenue_band:business.einvoice_revenue_band||"unknown",
    tax_group_member:!!business.einvoice_is_tax_group_member,
    timeline:due,
    customer_summary:{
      business_customers:Number(counts[0]?.business_customers||0),
      customers_missing_identifiers:Number(counts[0]?.customers_missing_identifiers||0)
    },
    readiness,
    ready_for_provider_testing:ready,
    message:connected
      ?"A UAE Accredited Service Provider connection is recorded. Provider transmission still depends on a configured and tested adapter."
      :"No verified UAE Accredited Service Provider connection is configured. No e-invoice transmission has been attempted."
  });
}
