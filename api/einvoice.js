import { db } from "hatchable";
import {
  buildUaeInvoice,
  makeUnifyEnvelope,
  payloadHash,
  sourceIdentity,
  complyanceRequest
} from "lib/complyance.js";

export const access = "user";
export const methods = ["GET", "POST"];

async function getBusiness(userId) {
  const { rows } = await db.query(
    "SELECT * FROM businesses WHERE owner_user_id=$1 ORDER BY created_at LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

function safeConnection(row) {
  if (!row) return null;
  return {
    provider: row.provider_code || "complyance",
    status: row.status,
    environment: row.environment,
    companyId: row.company_id,
    branchId: row.branch_id,
    sourceName: row.source_name,
    sourceVersion: row.source_version,
    branchName: row.branch_name,
    participantId: row.participant_id,
    mappingReady: row.mapping_ready,
    onboardingStatus: row.onboarding_status,
    lastError: row.last_error,
    connectedAt: row.connected_at,
    lastCheckedAt: row.last_checked_at
  };
}

async function getConnection(businessId, environment = "sandbox") {
  const { rows } = await db.query(
    "SELECT * FROM einvoice_connections WHERE business_id=$1 AND provider_code='complyance' AND environment=$2 ORDER BY created_at DESC LIMIT 1",
    [businessId, environment]
  );
  return rows[0] || null;
}

async function saveEvent({ businessId, invoiceId = null, type, status, message, response = null, environment = "sandbox" }) {
  await db.query(
    `INSERT INTO einvoice_events
      (business_id,invoice_id,provider_name,status,event_type,status_code,message,environment,provider_response)
     VALUES ($1,$2,'Complyance',$3,$4,$5,$6,$7,$8)`,
    [businessId, invoiceId, status, type, status, message || null, environment, response]
  );
}

async function connectCompany(business) {
  const existing = await getConnection(business.id, "sandbox");
  if (existing?.company_id) {
    return {
      reused: true,
      connection: safeConnection(existing),
      message: "This company already has a Complyance sandbox onboarding record. It was not submitted again."
    };
  }

  const tin = String(business.tin_number || "").replace(/\s+/g, "");
  const email = String(business.einvoice_contact_email || "").trim().toLowerCase();
  if (!/^1\d{9}$/.test(tin)) {
    const error = new Error("Enter the company's 10-digit UAE FTA TIN in Business Settings. Do not use the 15-digit VAT TRN.");
    error.status = 400;
    throw error;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Enter the FTA-authorised account administrator email used for Complyance ASP linkage.");
    error.status = 400;
    throw error;
  }
  if (!business.einvoice_contact_name) {
    const error = new Error("Enter the authorised e-invoicing contact person's name in Business Settings.");
    error.status = 400;
    throw error;
  }

  const source = sourceIdentity(business.id);
  const branchName = String(business.emirate || "Main Branch").trim();
  const request = {
    sourceName: source.sourceName,
    sourceVersion: source.sourceVersion,
    countryCode: "AE",
    tin,
    contactPersonEmail: email,
    contactPersonName: String(business.einvoice_contact_name).trim(),
    ...(business.einvoice_contact_mobile ? { contactPersonMobile: String(business.einvoice_contact_mobile).replace(/\s+/g, "") } : {}),
    branchName,
    platformEnvironment: "sandbox"
  };

  const result = await complyanceRequest("/v3/connect/companies", {
    environment: "sandbox",
    method: "POST",
    body: request,
    connect: true
  });
  const data = result?.data || {};
  if (!data.companyId || !data.sourceName || !data.sourceVersion) {
    const error = new Error("Complyance returned an incomplete company onboarding response. Check the Partner Portal before retrying.");
    error.status = 502;
    error.provider = result;
    throw error;
  }

  const ready = data.readyForInvoicing === true;
  const status = ready ? "connected" : "mapping_required";
  const { rows } = await db.query(
    `INSERT INTO einvoice_connections
      (business_id,provider_name,provider_code,status,environment,participant_id,company_id,source_id,branch_id,
       source_name,source_version,branch_name,mapping_ready,onboarding_status,external_account_ref,connected_at,
       last_checked_at,last_error,metadata)
     VALUES ($1,'Complyance','complyance',$2,'sandbox',$3,$4,$5,$6,$7,$8,$9,$10,$11,$4,now(),now(),NULL,$12)
     ON CONFLICT (business_id) DO UPDATE SET
       provider_name=EXCLUDED.provider_name,provider_code=EXCLUDED.provider_code,status=EXCLUDED.status,
       environment=EXCLUDED.environment,participant_id=EXCLUDED.participant_id,company_id=EXCLUDED.company_id,
       source_id=EXCLUDED.source_id,branch_id=EXCLUDED.branch_id,source_name=EXCLUDED.source_name,
       source_version=EXCLUDED.source_version,branch_name=EXCLUDED.branch_name,mapping_ready=EXCLUDED.mapping_ready,
       onboarding_status=EXCLUDED.onboarding_status,external_account_ref=EXCLUDED.external_account_ref,
       connected_at=EXCLUDED.connected_at,last_checked_at=EXCLUDED.last_checked_at,last_error=NULL,
       metadata=EXCLUDED.metadata,updated_at=now()
     RETURNING *`,
    [
      business.id, status, data.peppolParticipantId || (data.tin ? "0235:" + data.tin : "0235:" + tin),
      data.companyId, data.sourceId || null, data.branchId || null,
      data.sourceName, data.sourceVersion, data.branchName || branchName,
      ready, data.mappingReadiness?.status || null, JSON.stringify({
        requestId: result?.meta?.requestId || null,
        workspaceId: result?.meta?.workspaceId || null,
        mappingReadiness: data.mappingReadiness || null,
        platformEnvironment: data.platformEnvironment || "sandbox"
      })
    ]
  );

  await saveEvent({
    businessId: business.id,
    type: "company_onboarded",
    status,
    message: ready ? "Complyance sandbox company onboarded and mapping is ready." : "Company onboarded; mapping readiness must be completed before invoice submission.",
    response: result
  });

  return {
    reused: false,
    connection: safeConnection(rows[0]),
    mappingReadiness: data.mappingReadiness || null,
    readyForInvoicing: ready
  };
}

async function getInvoiceBundle(businessId, invoiceId) {
  const { rows: invoiceRows } = await db.query(
    "SELECT * FROM invoices WHERE id=$1 AND business_id=$2 LIMIT 1",
    [invoiceId, businessId]
  );
  const invoice = invoiceRows[0];
  if (!invoice) return null;
  const [{ rows: customers }, { rows: items }] = await Promise.all([
    db.query("SELECT * FROM customers WHERE id=$1 AND business_id=$2 LIMIT 1", [invoice.customer_id, businessId]),
    db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position,id", [invoice.id])
  ]);
  return { invoice, customer: customers[0] || null, items };
}

async function validateOrSubmit(business, invoiceId, purpose) {
  const connection = await getConnection(business.id, "sandbox");
  if (!connection?.company_id || !connection?.source_name || !connection?.source_version) {
    const error = new Error("Connect this company to Complyance sandbox before validating or submitting invoices.");
    error.status = 409;
    throw error;
  }
  if (!connection.mapping_ready) {
    const error = new Error("Complyance has not marked this source ready for invoicing. Complete the Default GETS Mapping test cases in the Partner Developer Portal first.");
    error.status = 409;
    throw error;
  }

  const bundle = await getInvoiceBundle(business.id, invoiceId);
  if (!bundle) {
    const error = new Error("Invoice not found for this business.");
    error.status = 404;
    throw error;
  }
  if (bundle.invoice.status === "draft" && purpose === "invoicing") {
    const error = new Error("Only finalized invoices can be submitted. Save or issue the invoice first.");
    error.status = 409;
    throw error;
  }

  const built = buildUaeInvoice({
    invoice: bundle.invoice,
    business,
    customer: bundle.customer,
    items: bundle.items,
    connection
  });
  if (built.errors.length) {
    const error = new Error("Invoice needs corrections before it can be sent to Complyance.");
    error.status = 422;
    error.validationErrors = built.errors;
    throw error;
  }

  const source = connection.source_name + ":" + connection.source_version;
  const envelope = makeUnifyEnvelope({
    environment: "sandbox",
    source,
    payload: built.payload,
    modifiers: built.modifiers,
    purpose
  });

  if (purpose === "validate") {
    const result = await complyanceRequest("/api/v3/unify", {
      environment: "sandbox",
      method: "POST",
      body: envelope
    });
    return { validationOnly: true, result };
  }

  const { rows: existingRows } = await db.query(
    "SELECT * FROM einvoice_documents WHERE business_id=$1 AND invoice_id=$2 AND direction='outbound' ORDER BY created_at DESC LIMIT 1",
    [business.id, invoiceId]
  );
  const existing = existingRows[0];
  if (existing?.provider_document_id && existing.status !== "rejected") {
    const error = new Error("This invoice already has a Complyance document reference. Refresh its status instead of submitting it again.");
    error.status = 409;
    error.documentId = existing.provider_document_id;
    throw error;
  }
  if (existing && ["submitting", "submission_unknown", "processing", "accepted"].includes(existing.status)) {
    const error = new Error("A previous submission may already have reached Complyance. Refresh its status before retrying to avoid duplicate invoices.");
    error.status = 409;
    error.documentId = existing.provider_document_id || null;
    throw error;
  }

  let documentRow;
  if (existing) {
    const { rows } = await db.query(
      `UPDATE einvoice_documents SET status='submitting',payload_json=$1,payload_sha256=$2,last_error=NULL,
       provider_response=NULL,provider_errors=NULL,validation_response=NULL,updated_at=now()
       WHERE id=$3 AND business_id=$4 RETURNING *`,
      [JSON.stringify(envelope), payloadHash(envelope), existing.id, business.id]
    );
    documentRow = rows[0];
  } else {
    const { rows } = await db.query(
      `INSERT INTO einvoice_documents
       (business_id,invoice_id,direction,document_type,status,provider_code,provider_environment,payload_json,payload_sha256,issued_at)
       VALUES ($1,$2,'outbound','invoice','submitting','complyance','sandbox',$3,$4,$5) RETURNING *`,
      [business.id, invoiceId, JSON.stringify(envelope), payloadHash(envelope), bundle.invoice.invoice_date]
    );
    documentRow = rows[0];
  }

  try {
    const result = await complyanceRequest("/api/v3/unify", {
      environment: "sandbox",
      method: "POST",
      body: envelope
    });
    const documentId = result?.documentId;
    if (!documentId) throw Object.assign(new Error("Complyance accepted the request but did not return a documentId. Check the portal before retrying."), { code: "COMPLYANCE_DOCUMENT_ID_MISSING", status: 502, provider: result });
    const xml = result.Base64XML ? Buffer.from(result.Base64XML, "base64").toString("utf8") : null;
    await db.query(
      `UPDATE einvoice_documents SET status='submitted',provider_document_id=$1,provider_response=$2,
       validation_response=$2,xml_payload=$3,submitted_at=now(),updated_at=now()
       WHERE id=$4 AND business_id=$5`,
      [documentId, JSON.stringify(result), xml, documentRow.id, business.id]
    );
    await db.query(
      `UPDATE invoices SET einvoice_status='submitted',einvoice_provider_document_id=$1,
       einvoice_last_error=NULL,einvoice_submitted_at=now(),updated_at=now()
       WHERE id=$2 AND business_id=$3`,
      [documentId, invoiceId, business.id]
    );
    await saveEvent({
      businessId: business.id, invoiceId, type: "invoice_submitted", status: "submitted",
      message: "Invoice submitted to Complyance sandbox. Final acceptance is pending.",
      response: result
    });
    return { documentId, documentNumber: result.documentNumber || bundle.invoice.invoice_number, status: "submitted", xmlAvailable: !!xml, message: result.message || "Submitted. Check final status before treating the invoice as accepted." };
  } catch (error) {
    const uncertain = !error.status || error.status >= 500;
    const status = uncertain ? "submission_unknown" : "rejected";
    await db.query(
      "UPDATE einvoice_documents SET status=$1,last_error=$2,provider_response=$3,updated_at=now() WHERE id=$4 AND business_id=$5",
      [status, String(error.message || "Complyance submission failed"), error.provider ? JSON.stringify(error.provider) : null, documentRow.id, business.id]
    );
    await db.query(
      "UPDATE invoices SET einvoice_status=$1,einvoice_last_error=$2,updated_at=now() WHERE id=$3 AND business_id=$4",
      [status, String(error.message || "Complyance submission failed"), invoiceId, business.id]
    );
    await saveEvent({
      businessId: business.id, invoiceId, type: "submission_error", status,
      message: String(error.message || "Complyance submission failed"),
      response: error.provider || null
    });
    throw error;
  }
}

async function refreshDocument(business, documentId) {
  const { rows } = await db.query(
    "SELECT * FROM einvoice_documents WHERE business_id=$1 AND provider_code='complyance' AND provider_document_id=$2 AND direction='outbound' LIMIT 1",
    [business.id, documentId]
  );
  const document = rows[0];
  if (!document) {
    const error = new Error("Complyance document was not found for this business.");
    error.status = 404;
    throw error;
  }
  const result = await complyanceRequest("/api/v3/documents/" + encodeURIComponent(documentId) + "?type=sales", {
    environment: document.provider_environment || "sandbox"
  });
  const data = result?.data || result || {};
  const state = String(data.state || "processing");
  const terminal = data.isTerminal === true;
  const accepted = state === "final_valid";
  const status = accepted ? "accepted" : (state.toLowerCase().includes("invalid") || state.toLowerCase().includes("rejected") ? "rejected" : "processing");
  const errors = data.errors || [];
  await db.query(
    `UPDATE einvoice_documents SET status=$1,provider_state=$2,provider_is_terminal=$3,
     provider_compliance=$4,provider_errors=$5,provider_response=$6,last_error=$7,
     exchanged_at=CASE WHEN $3 THEN now() ELSE exchanged_at END,updated_at=now()
     WHERE id=$8 AND business_id=$9`,
    [status, state, terminal, data.compliance ? JSON.stringify(data.compliance) : null,
     JSON.stringify(errors), JSON.stringify(result), errors.length ? JSON.stringify(errors) : null,
     document.id, business.id]
  );
  await db.query(
    "UPDATE invoices SET einvoice_status=$1,einvoice_last_error=$2,updated_at=now() WHERE id=$3 AND business_id=$4",
    [status, errors.length ? JSON.stringify(errors) : null, document.invoice_id, business.id]
  );
  await saveEvent({
    businessId: business.id, invoiceId: document.invoice_id, type: "status_checked", status,
    message: "Complyance document state: " + state,
    response: result,
    environment: document.provider_environment || "sandbox"
  });
  return { documentId, status, providerState: state, isTerminal: terminal, accepted, errors, compliance: data.compliance || null, lastUpdatedAt: data.lastUpdatedAt || null };
}

export default async function(req, res) {
  const business = await getBusiness(req.user.id);
  if (!business) return res.status(400).json({ error: "Complete business setup before configuring e-invoicing." });

  try {
    if (req.method === "GET") {
      const [connection, documents] = await Promise.all([
        getConnection(business.id, "sandbox"),
        db.query(
          "SELECT id,invoice_id,document_type,status,provider_document_id,provider_state,provider_is_terminal,last_error,submitted_at,created_at FROM einvoice_documents WHERE business_id=$1 AND provider_code='complyance' AND direction='outbound' ORDER BY created_at DESC LIMIT 30",
          [business.id]
        )
      ]);
      return res.json({
        provider: "complyance",
        environment: "sandbox",
        connection: safeConnection(connection),
        documents: documents.rows
      });
    }

    const action = String(req.body?.action || "");
    if (action === "connect") {
      const result = await connectCompany(business);
      return res.status(200).json(result);
    }
    if (action === "validate") {
      const invoiceId = String(req.body?.invoiceId || "");
      if (!invoiceId) return res.status(400).json({ error: "invoiceId is required." });
      const result = await validateOrSubmit(business, invoiceId, "validate");
      return res.json(result);
    }
    if (action === "submit") {
      const invoiceId = String(req.body?.invoiceId || "");
      if (!invoiceId) return res.status(400).json({ error: "invoiceId is required." });
      const result = await validateOrSubmit(business, invoiceId, "invoicing");
      return res.status(202).json(result);
    }
    if (action === "refresh") {
      const documentId = String(req.body?.documentId || "");
      if (!documentId) return res.status(400).json({ error: "documentId is required." });
      const result = await refreshDocument(business, documentId);
      return res.json(result);
    }
    return res.status(400).json({ error: "Supported actions: connect, validate, submit, refresh." });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({
      error: error.message || "Complyance integration error",
      code: error.code || null,
      validationErrors: error.validationErrors || undefined,
      documentId: error.documentId || undefined,
      provider: error.provider || undefined
    });
  }
}
