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
            trade_license_authority,city,einvoice_contact_name,einvoice_contact_email,einvoice_contact_mobile,einvoice_scope_status,einvoice_revenue_band,
            einvoice_is_tax_group_member,einvoice_branch_trade_license_number
     FROM businesses WHERE owner_user_id=$1 LIMIT 1`,[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const business=b[0];
  const {rows:c}=await db.query("SELECT id,provider_name,provider_code,accreditation_number,status,environment,participant_id,company_id,source_id,branch_id,source_name,source_version,branch_name,mapping_ready,onboarding_status,last_checked_at,last_error,connected_at,metadata FROM einvoice_connections WHERE business_id=$1 LIMIT 1",[business.id]);
  const conn=c[0]||null;
  const {rows:counts}=await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE einvoice_buyer_type IN ('business','government'))::int AS business_customers,
       COUNT(*) FILTER (
         WHERE einvoice_buyer_type IN ('business','government')
           AND (COALESCE(tin_number,'')='' OR COALESCE(buyer_id_value,'')='')
       )::int AS customers_missing_identifiers
     FROM customers WHERE business_id=$1`,[business.id]);
  const connected=!!(conn&&conn.status==="connected"&&conn.provider_code==="complyance"&&conn.accreditation_number==="112219");
  const readyForInvoicing=connected&&conn.mapping_ready===true;
  const due=timeline(business.einvoice_revenue_band);
  if(due) due.appointment_overdue=new Date().toISOString().slice(0,10)>due.appointment_deadline;
  const readiness={
    business_name:!!business.legal_name,
    tin:/^1\d{9}$/.test(String(business.tin_number||"")),
    trade_license:!!business.trade_license_number&&!!business.trade_license_authority,
    seller_address:!!business.address&&!!business.city&&!!business.emirate,
    asp_contact:!!business.einvoice_contact_name&&/^\\S+@\\S+\\.\\S+$/.test(String(business.einvoice_contact_email||"")),
    trn:!business.vat_registered||/^1\\d{12}03$/.test(String(business.trn||"").replace(/\\s+/g,"")),
    scope_assessed:(business.einvoice_scope_status||"not_assessed")!=="not_assessed",
    revenue_band_selected:(business.einvoice_revenue_band||"unknown")!=="unknown",
    customer_identifiers:!!(counts[0]&&Number(counts[0].customers_missing_identifiers)===0),
    asp_provider_connected:connected,
    asp_mapping_ready:!!(conn&&conn.mapping_ready)
  };
  const required=["business_name","tin","trade_license","seller_address","trn","scope_assessed","revenue_band_selected","asp_contact"];
  const ready=required.every(k=>readiness[k]);
  res.json({
    connected,
    ready_for_invoicing:readyForInvoicing,
    connection:conn?{
      provider_name:conn.provider_name,provider_code:conn.provider_code,
      accreditation_number:conn.accreditation_number,status:conn.status,
      environment:conn.environment,participant_id:conn.participant_id,
      company_id:conn.company_id,source_id:conn.source_id,branch_id:conn.branch_id,
      source_name:conn.source_name,source_version:conn.source_version,
      branch_name:conn.branch_name,mapping_ready:!!conn.mapping_ready,
      onboarding_status:conn.onboarding_status,last_checked_at:conn.last_checked_at,
      last_error:conn.last_error,metadata:conn.metadata||{}
    }:null,
    scope_status:business.einvoice_scope_status||"not_assessed",
    revenue_band:business.einvoice_revenue_band||"unknown",
    tax_group_member:!!business.einvoice_is_tax_group_member,
    timeline:due,
    customer_summary:{
      business_customers:Number(counts[0]?.business_customers||0),
      customers_missing_identifiers:Number(counts[0]?.customers_missing_identifiers||0)
    },
    readiness,
    seller_profile_complete:ready,
    message:readyForInvoicing
      ?"Complyance is onboarded and this source reports ready for invoicing. Sandbox validation is still required before any production use."
      :conn&&conn.status==="pending_authorization"
        ?"A Complyance company record exists, but ASP onboarding is not complete. Check the FTA authorisation and refresh the connection."
        :connected
          ?"Complyance is linked in sandbox. Complete the Default GETS Mapping and pass its Testbed cases before invoice submission."
          :"Complyance is not linked. Complete the FTA ASP authorisation and connect the sandbox company."
  });
}
